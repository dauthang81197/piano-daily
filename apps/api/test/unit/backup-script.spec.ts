import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Chạy deploy/backup/*.sh với pg_dump/aws/pg_restore giả đặt trong PATH tạm (Story 5.2). Không đụng DB hay R2 thật.
const ROOT = path.resolve(__dirname, "../../../..");
const BACKUP = path.join(ROOT, "deploy/backup/backup.sh");
const LOOP = path.join(ROOT, "deploy/backup/backup-loop.sh");
const RESTORE = path.join(ROOT, "deploy/backup/restore.sh");

const hasBash = spawnSync("bash", ["-c", "true"]).status === 0;

const FAKE_PG_DUMP = `#!/usr/bin/env bash
case "\${FAKE_PG_MODE:-ok}" in
  fail) echo "pg_dump: connection refused" >&2; exit 1 ;;
  empty) exit 0 ;;
  *) printf 'PGDMP-fake-data' ;;
esac
`;

// s3 cp <src> s3://bucket/key | s3api list-objects-v2 --prefix P | s3api delete-object --key K ; kho giả = thư mục FAKE_S3_DIR.
const FAKE_AWS = `#!/usr/bin/env bash
store="$FAKE_S3_DIR"
if [ "$1" = "s3" ] && [ "$2" = "cp" ]; then
  if [ -n "\${FAKE_UPLOAD_FAIL:-}" ]; then echo "AccessDenied" >&2; exit 1; fi
  if [ "\${3#s3://}" != "$3" ]; then
    # tải xuống: s3://bucket/key -> file
    src="\${3#s3://*/}"
    cp "$store/$src" "$4"
    exit $?
  fi
  dest="\${4#s3://*/}"
  mkdir -p "$store/$(dirname "$dest")" && cp "$3" "$store/$dest"
  exit $?
fi
if [ "$2" = "list-objects-v2" ]; then
  if [ -n "\${FAKE_LIST_FAIL:-}" ]; then exit 1; fi
  prefix=""
  while [ $# -gt 0 ]; do
    if [ "$1" = "--prefix" ]; then prefix="$2"; fi
    shift
  done
  out=""
  cd "$store" 2>/dev/null || { echo None; exit 0; }
  for f in $(find . -type f | sed 's|^\\./||' | sort); do
    case "$f" in
      "$prefix"*) if [ -n "$out" ]; then out="$out	$f"; else out="$f"; fi ;;
    esac
  done
  if [ -n "$out" ]; then echo "$out"; else echo None; fi
  exit 0
fi
if [ "$2" = "delete-object" ]; then
  while [ $# -gt 0 ]; do
    if [ "$1" = "--key" ]; then key="$2"; fi
    shift
  done
  rm -f "$store/$key"
  exit 0
fi
exit 1
`;

const FAKE_PG_RESTORE = `#!/usr/bin/env bash
echo "$@" >"$FAKE_RESTORE_LOG"
cat "\${@: -1}" >"$FAKE_RESTORE_LOG.content"
`;

describe.skipIf(!hasBash)("deploy/backup scripts", () => {
  let work: string;
  let bin: string;
  let store: string;

  const baseEnv = (): NodeJS.ProcessEnv => ({
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    DATABASE_URL: "postgresql://u:SECRETPASS@db:5432/x",
    S3_ENDPOINT: "https://acct.r2.example",
    S3_ACCESS_KEY_ID: "AKIATEST",
    S3_SECRET_ACCESS_KEY: "SECRETKEY",
    S3_BUCKET_PRIVATE: "private",
    FAKE_S3_DIR: store,
    FAKE_RESTORE_LOG: path.join(work, "restore.log"),
  });
  const run = (script: string, args: string[], env: NodeJS.ProcessEnv) =>
    spawnSync("bash", [script, ...args], { env, encoding: "utf8" });

  const seed = (keys: string[]) => {
    for (const key of keys) {
      const file = path.join(store, key);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "old");
    }
  };
  const stored = () => {
    const dir = path.join(store, "backups");
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  };
  const oldKeys = (n: number) =>
    Array.from(
      { length: n },
      (_, i) =>
        `backups/piano-daily-202601${String(i + 1).padStart(2, "0")}T200000Z.dump`,
    );

  beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), "backup-spec-"));
    bin = path.join(work, "bin");
    store = path.join(work, "store");
    mkdirSync(bin);
    mkdirSync(store);
    for (const [name, body] of [
      ["pg_dump", FAKE_PG_DUMP],
      ["aws", FAKE_AWS],
      ["pg_restore", FAKE_PG_RESTORE],
    ] as const) {
      writeFileSync(path.join(bin, name), body.replace(/\r\n/g, "\n"));
      chmodSync(path.join(bin, name), 0o755);
    }
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it("thành công: upload key có timestamp UTC và log INFO", () => {
    const r = run(BACKUP, [], baseEnv());
    expect(r.status).toBe(0);
    const files = stored();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^piano-daily-\d{8}T\d{6}Z\.dump$/);
    expect(readFileSync(path.join(store, "backups", files[0]!), "utf8")).toBe(
      "PGDMP-fake-data",
    );
    expect(r.stdout).toMatch(
      /^INFO .*backups\/piano-daily-\d{8}T\d{6}Z\.dump.*\d+ byte/m,
    );
    expect(r.stdout + r.stderr).not.toMatch(/SECRETPASS|SECRETKEY/);
  });

  it("xoay vòng: 16 bản cũ + 1 mới, BACKUP_KEEP=14 còn đúng 14 bản mới nhất; file ngoài mẫu giữ nguyên", () => {
    const olds = oldKeys(16);
    seed([...olds, "backups/piano-daily-note.txt"]);
    const r = run(BACKUP, [], { ...baseEnv(), BACKUP_KEEP: "14" });
    expect(r.status).toBe(0);
    const dumps = stored().filter((f) => f.endsWith(".dump"));
    expect(dumps).toHaveLength(14);
    expect(dumps).not.toContain(path.basename(olds[0]!));
    expect(dumps).not.toContain(path.basename(olds[2]!));
    expect(dumps).toContain(path.basename(olds[15]!));
    expect(stored()).toContain("piano-daily-note.txt");
  });

  it("mặc định BACKUP_KEEP là 14", () => {
    seed(oldKeys(20));
    expect(run(BACKUP, [], baseEnv()).status).toBe(0);
    expect(stored().filter((f) => f.endsWith(".dump"))).toHaveLength(14);
  });

  it.each([
    ["pg_dump lỗi", { FAKE_PG_MODE: "fail" }],
    ["dump rỗng", { FAKE_PG_MODE: "empty" }],
    ["upload lỗi", { FAKE_UPLOAD_FAIL: "1" }],
  ])("%s: thoát mã khác 0, log ERROR, không xoá bản cũ", (_name, extra) => {
    seed(oldKeys(16));
    const r = run(BACKUP, [], { ...baseEnv(), BACKUP_KEEP: "3", ...extra });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/^ERROR /m);
    expect(stored()).toHaveLength(16);
    expect(r.stdout + r.stderr).not.toMatch(/SECRETPASS|SECRETKEY/);
  });

  it("liệt kê lỗi sau upload: thoát mã khác 0 và log ERROR", () => {
    const r = run(BACKUP, [], { ...baseEnv(), FAKE_LIST_FAIL: "1" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/^ERROR /m);
  });

  it("thiếu S3_BUCKET_PRIVATE: thoát mã khác 0 nêu tên biến", () => {
    const env = baseEnv();
    delete env.S3_BUCKET_PRIVATE;
    const r = run(BACKUP, [], env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/^ERROR .*S3_BUCKET_PRIVATE/m);
    expect(stored()).toHaveLength(0);
  });

  it("backup-loop.sh --once thoát với mã của backup.sh", () => {
    const ok = run(LOOP, ["--once"], baseEnv());
    expect(ok.status).toBe(0);
    expect(stored()).toHaveLength(1);
    const bad = run(LOOP, ["--once"], { ...baseEnv(), FAKE_PG_MODE: "fail" });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/^ERROR /m);
  });

  it("backup-loop.sh từ chối BACKUP_AT sai định dạng", () => {
    const r = run(LOOP, [], { ...baseEnv(), BACKUP_AT: "25:99" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^ERROR /m);
  });

  it("restore.sh thiếu tham số thì thoát mã 2", () => {
    expect(run(RESTORE, [], baseEnv()).status).toBe(2);
    expect(run(RESTORE, ["file.dump"], baseEnv()).status).toBe(2);
  });

  it("restore.sh gọi pg_restore với cờ an toàn trên file cục bộ", () => {
    const dump = path.join(work, "x.dump");
    writeFileSync(dump, "PGDMP");
    const r = run(RESTORE, [dump, "postgresql://local/test"], baseEnv());
    expect(r.status).toBe(0);
    const called = readFileSync(path.join(work, "restore.log"), "utf8");
    expect(called).toContain("--no-owner --clean --if-exists");
    expect(called).toContain("--dbname=postgresql://local/test");
  });

  it("restore.sh tải key S3 rồi khôi phục đúng nội dung", () => {
    const key = "backups/piano-daily-20260101T200000Z.dump";
    seed([key]);
    writeFileSync(path.join(store, key), "SEEDED-DUMP-CONTENT");
    const r = run(RESTORE, [key, "postgresql://local/test"], baseEnv());
    expect(r.status).toBe(0);
    expect(readFileSync(path.join(work, "restore.log.content"), "utf8")).toBe(
      "SEEDED-DUMP-CONTENT",
    );
  });

  it.each(["0", "abc"])(
    "BACKUP_KEEP=%s bị từ chối với ERROR và mã khác 0",
    (keep) => {
      seed(oldKeys(3));
      const r = run(BACKUP, [], { ...baseEnv(), BACKUP_KEEP: keep });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/^ERROR .*BACKUP_KEEP/m);
      expect(stored()).toHaveLength(3);
    },
  );

  it("xoay vòng chỉ xét key timestamp chặt và không bao giờ xoá bản vừa upload", () => {
    // Bản "tương lai" xếp sau bản mới; KEEP=1 sẽ xoá bản mới nếu không có bảo vệ.
    const future = [
      "backups/piano-daily-20990101T000000Z.dump",
      "backups/piano-daily-20990102T000000Z.dump",
    ];
    const others = [
      "backups/piano-daily-note.txt",
      "backups/piano-daily-abc.dump",
      "backups/piano-daily-2026T1.dump",
      "backups/piano-daily-20260101T000000Z.dump.bak",
    ];
    seed([...future, ...others]);
    const r = run(BACKUP, [], { ...baseEnv(), BACKUP_KEEP: "1" });
    expect(r.status).toBe(0);
    const files = stored();
    for (const o of others) expect(files).toContain(path.basename(o));
    const created = /(piano-daily-\d{8}T\d{6}Z\.dump)/.exec(r.stdout)![1]!;
    expect(files).toContain(created);
  });

  it("backup-loop.sh từ chối tham số lạ với mã 2", () => {
    const r = run(LOOP, ["--bogus"], baseEnv());
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^ERROR /m);
  });

  it("backup-loop.sh: ngủ đúng thời lượng, chạy BACKUP_CMD, log ERROR khi lỗi và vẫn lặp", () => {
    const calls = path.join(work, "calls.log");
    const fakeDate = `#!/usr/bin/env bash
if [ "$1" = "+%s" ]; then echo 1000
elif [ "$1" = "-d" ] && [ "\${2#today}" != "$2" ]; then echo 900
elif [ "$1" = "-d" ] && [ "\${2#tomorrow}" != "$2" ]; then echo 1500
else echo "2026-01-01 03:00 +07"; fi
`;
    // Sleep thứ 4 giết vòng lặp cha để giới hạn số vòng.
    const fakeSleep = `#!/usr/bin/env bash
echo "sleep $1" >>"$CALLS_LOG"
n=$(grep -c '^sleep' "$CALLS_LOG")
if [ "$n" -ge 4 ]; then kill $PPID; fi
`;
    const stub = `#!/usr/bin/env bash
echo "stub" >>"$CALLS_LOG"
exit 3
`;
    for (const [name, body] of [
      ["date", fakeDate],
      ["sleep", fakeSleep],
      ["stub-backup", stub],
    ] as const) {
      writeFileSync(path.join(bin, name), body);
      chmodSync(path.join(bin, name), 0o755);
    }
    const r = run(LOOP, [], {
      ...baseEnv(),
      CALLS_LOG: calls,
      BACKUP_CMD: path.join(bin, "stub-backup"),
    });
    const lines = readFileSync(calls, "utf8").trim().split("\n");
    // 1000 -> 1500 (hôm nay đã qua): ngủ 500s, chạy stub (lỗi), ngủ 60s, lặp lại vẫn tính 500s.
    expect(lines).toEqual([
      "sleep 500",
      "stub",
      "sleep 60",
      "sleep 500",
      "stub",
      "sleep 60",
    ]);
    expect(r.stderr).toMatch(/^ERROR /m);
  });
});
