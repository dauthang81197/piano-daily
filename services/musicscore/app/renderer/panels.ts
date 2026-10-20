import { clefAt, keyAt, tempoAt, timeAt, type Articulation, type Clef, type Dynamic, type Score } from "../../src/model/score.ts";
import * as A from "./actions.ts";
import { DURATION_KEYS, INSTRUMENTS, durationName, instrumentName, keyName, pitchName } from "./names.ts";
import { $, S, api, h, hooks } from "./state.ts";
import { setInputMode } from "./view.ts";

// ---- note-input toolbar (under the main toolbar, like MuseScore's) ---------------------------

function renderNoteBar(): void {
  const bar = $("toolbar2");
  const ev = S.cursor ? A.eventOf(S.cursor) : undefined;
  // In note-input mode the buttons show the length of the next note, not that of whatever is selected.
  const current = S.inputMode ? S.dur.type : (ev?.duration?.type ?? S.dur.type);
  const dots = S.inputMode || !ev ? S.dur.dots : (ev.duration?.dots ?? 0);
  const hasNote = ev?.kind === "chord";

  const btn = (label: string, title: string, onClick: () => void, opts: { active?: boolean; disabled?: boolean; id?: string } = {}) =>
    h("button", { class: opts.active ? "active" : "", disabled: opts.disabled, title, id: opts.id, onClick }, label);

  const durations = h(
    "div",
    { class: "group" },
    ...DURATION_KEYS.map((d) => btn(d.label, `Trường độ ${d.label} (phím ${d.key})`, () => A.setDuration(d.type), { active: d.type === current })),
    btn("•", "Chấm dôi (phím .)", A.toggleDot, { active: dots > 0 }),
  );

  bar.replaceChildren(
    h("div", { class: "group" }, btn("✎ Nhập nốt", "Chế độ nhập nốt: bấm lên khuông để đặt nốt (N)", () => setInputMode(!S.inputMode), { active: S.inputMode, id: "btn-input" })),
    durations,
    h(
      "div",
      { class: "group" },
      btn("♭", "Giáng", () => A.accidental(-1), { disabled: !hasNote }),
      btn("♮", "Bình", () => A.accidental(0, true), { disabled: !hasNote }),
      btn("♯", "Thăng", () => A.accidental(1), { disabled: !hasNote }),
      btn("↑", "Lên nửa cung (↑)", () => A.nudge(1), { disabled: !hasNote }),
      btn("↓", "Xuống nửa cung (↓)", () => A.nudge(-1), { disabled: !hasNote }),
    ),
    h(
      "div",
      { class: "group" },
      btn("Nối", "Nối luyến sang nốt cùng cao độ (T)", A.toggleTie, { disabled: !hasNote }),
      btn("Luyến", "Luyến phrase từ nốt đầu đến nốt cuối vùng chọn (S)", A.toggleSlur, { disabled: !hasNote }),
      btn("3:2", "Tam liên (Ctrl+3)", () => A.makeTuplet(3, 2), { disabled: !S.cursor }),
    ),
    h(
      "div",
      { class: "group" },
      btn("Nghỉ", "Biến thành dấu lặng (phím 0)", A.makeRest, { disabled: S.refs.length === 0 }),
      btn("Xoá", "Xoá (Delete)", A.deleteSelected, { disabled: S.refs.length === 0 }),
    ),
    h(
      "div",
      { class: "group" },
      btn("Chép", "Chép (Ctrl+C)", () => void A.copySelection(), { disabled: S.refs.length === 0 }),
      btn("Cắt", "Cắt (Ctrl+X)", A.cutSelection, { disabled: S.refs.length === 0 }),
      btn("Dán", "Dán (Ctrl+V)", A.pasteClipboard, { disabled: !S.clipboard }),
    ),
  );
}

// ---- palettes (left) -----------------------------------------------------------------------

const DYNAMIC_LABEL: Record<Dynamic, string> = {
  pppp: "pppp", ppp: "ppp", pp: "pp", p: "p", mp: "mp", mf: "mf", f: "f", ff: "ff", fff: "fff", ffff: "ffff", fp: "fp", sf: "sf", sfz: "sfz", rfz: "rfz",
};

const ARTICULATIONS: { id: Articulation; label: string; title: string }[] = [
  { id: "staccato", label: "·", title: "Staccato (ngắt)" },
  { id: "staccatissimo", label: "▾", title: "Staccatissimo" },
  { id: "accent", label: ">", title: "Dấu nhấn (accent)" },
  { id: "marcato", label: "^", title: "Marcato" },
  { id: "tenuto", label: "–", title: "Tenuto (giữ đủ)" },
];

function group(title: string, open: boolean, ...children: (Node | string)[]): HTMLElement {
  const d = h("details", { open }, h("summary", {}, title), h("div", { class: "palette-grid" }, ...children));
  return d;
}

function buildPalette(): void {
  const pal = $("palette");
  const b = (label: string, title: string, onClick: () => void, cls = "") => h("button", { class: cls, title, onClick }, label);

  const verse = h("select", { class: "narrow", onChange: (e: Event) => (S.verse = Number((e.target as HTMLSelectElement).value)) });
  for (let v = 1; v <= 4; v++) verse.append(h("option", { value: String(v) }, `Lời ${v}`));
  const lyric = h("input", { id: "lyric-input", type: "text", placeholder: "Gõ lời, Space sang nốt kế, - nối chữ", spellcheck: false });
  lyric.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") return void lyric.blur();
    const submit = e.key === " " || e.key === "Enter" || e.key === "Tab" || (e.key === "-" && !e.shiftKey);
    if (!submit) return;
    e.preventDefault();
    const text = lyric.value + (e.key === "-" ? "-" : "");
    lyric.value = "";
    if (text.trim() || e.key !== "-") void A.enterLyric(text);
  });

  pal.replaceChildren(
    h("h3", {}, "Bảng ký hiệu"),
    group(
      "Sắc thái",
      true,
      ...(Object.keys(DYNAMIC_LABEL) as Dynamic[]).map((d) => b(DYNAMIC_LABEL[d], `Sắc thái ${d} (đặt ở nốt đầu của vùng chọn; bấm lại để bỏ)`, () => A.applyDynamic(d), "dyn")),
      b("✕", "Bỏ sắc thái", () => A.applyDynamic(null)),
    ),
    group(
      "Dấu nhấn",
      true,
      ...ARTICULATIONS.map((a) => b(a.label, a.title, () => A.applyArticulation(a.id))),
      b("𝄐", "Fermata (ngân)", A.applyFermata),
    ),
    group("Luyến & nối", true, b("Luyến", "Luyến phrase (S)", A.toggleSlur), b("Xoá luyến", "Xoá luyến ở vùng chọn", A.removeSlurSel), b("Nối", "Nối luyến cùng cao độ (T)", A.toggleTie)),
    group(
      "Nhắc lại",
      false,
      b("|:", "Dấu nhắc lại ở đầu ô nhịp đầu vùng chọn", () => A.toggleRepeat("start")),
      b(":|", "Dấu nhắc lại ở cuối ô nhịp cuối vùng chọn", () => A.toggleRepeat("end")),
      b("1.", "Ô 1. (ngoặc kết thúc lần một) trên vùng chọn", () => A.setVoltaSel([1])),
      b("2.", "Ô 2. trên vùng chọn", () => A.setVoltaSel([2])),
      b("1.2.", "Ô 1. và 2. cùng ngoặc", () => A.setVoltaSel([1, 2])),
      b("✕", "Bỏ ngoặc ô", () => A.setVoltaSel(null)),
    ),
    group(
      "Tam liên",
      false,
      b("3:2", "Tam liên (3 nốt trong thời gian 2)", () => A.makeTuplet(3, 2)),
      b("5:4", "Ngũ liên", () => A.makeTuplet(5, 4)),
      b("6:4", "Lục liên", () => A.makeTuplet(6, 4)),
      b("2:3", "Đôi liên (duplet)", () => A.makeTuplet(2, 3)),
      b("Gỡ", "Gỡ nhóm liên", A.dissolveTuplet),
    ),
    h("details", { open: true }, h("summary", {}, "Lời hát"), h("div", { class: "lyric-box" }, verse, lyric)),
  );
}

// ---- properties (right) ----------------------------------------------------------------------

const CLEFS: { label: string; clef: Clef }[] = [
  { label: "Khoá Sol", clef: { sign: "G", line: 2 } },
  { label: "Khoá Fa", clef: { sign: "F", line: 4 } },
  { label: "Khoá Do (alto)", clef: { sign: "C", line: 3 } },
  { label: "Khoá Do (tenor)", clef: { sign: "C", line: 4 } },
  { label: "Khoá Sol 8vb", clef: { sign: "G", line: 2, octaveChange: -1 } },
];

function renderProperties(): void {
  const s = S.st.score;
  $("panel").replaceChildren(sectionSelection(s), sectionMeasure(s), sectionScore(s), sectionParts(s));
}

function sectionSelection(s: Score): HTMLElement {
  const sec = h("section", {}, h("h3", {}, "Đang chọn"));
  let text = "Chưa chọn gì. Bấm vào nốt, kéo khung, hoặc bấm vào ô nhịp.";
  if (S.measures) {
    const m = S.measures;
    text = `Ô nhịp ${m.from + 1}${m.to > m.from ? `–${m.to + 1}` : ""} · ${S.refs.length} đối tượng`;
  } else if (S.refs.length > 1) {
    text = `${S.refs.length} đối tượng`;
  } else if (S.cursor) {
    const ev = A.eventOf(S.cursor);
    if (ev?.kind === "chord") text = ev.notes.map((n) => pitchName(n.pitch)).join(" + ") + " · " + durationName(ev.duration, ev.ticks);
    else if (ev) text = "Dấu lặng · " + durationName(ev.duration, ev.ticks);
    const marks: string[] = [];
    if (ev?.dynamic) marks.push(ev.dynamic);
    if (ev?.kind === "chord" && ev.articulations?.length) marks.push(...ev.articulations);
    if (ev?.fermata) marks.push("fermata");
    if (ev?.kind === "chord" && ev.slurStart) marks.push("bắt đầu luyến");
    if (ev?.kind === "chord" && ev.slurStop) marks.push("kết thúc luyến");
    if (marks.length) text += ` · ${marks.join(", ")}`;
  }
  sec.append(h("div", { class: "info", id: "note-info" }, text));
  if (S.clipboard) sec.append(h("div", { class: "muted" }, `Bộ nhớ tạm: ${S.clipboard.items.length} đối tượng`));
  void s;
  return sec;
}

function sectionMeasure(s: Score): HTMLElement {
  const { from, to } = A.measureRange();
  const m = from;
  const sec = h("section", {}, h("h3", {}, to > from ? `Ô nhịp ${from + 1}–${to + 1}` : `Ô nhịp ${m + 1}`));
  const key = keyAt(s, m);
  const time = timeAt(s, m);

  const keySel = h("select", {
    onChange: (e: Event) => {
      const [f, mode] = (e.target as HTMLSelectElement).value.split("|");
      void A.edit("setKeySignature", m, { fifths: Number(f), mode });
    },
  });
  for (const mode of ["major", "minor"] as const) {
    for (let f = -7; f <= 7; f++) {
      const o = h("option", { value: `${f}|${mode}` }, keyName({ fifths: f, mode }));
      if (f === key.fifths && mode === key.mode) o.selected = true;
      keySel.append(o);
    }
  }
  sec.append(h("div", { class: "row" }, h("label", {}, "Điệu"), keySel));

  const beats = h("input", { type: "number", min: "1", max: "32", value: String(time.beats) });
  const beatType = h("select", { class: "narrow" });
  for (const b of [1, 2, 4, 8, 16, 32]) {
    const o = h("option", { value: String(b) }, String(b));
    if (b === time.beatType) o.selected = true;
    beatType.append(o);
  }
  sec.append(h("div", { class: "row" }, h("label", {}, "Nhịp"), beats, "/", beatType, h("button", { onClick: () => void applyTime(m, Number(beats.value), Number(beatType.value)) }, "Áp dụng")));

  const tempo = h("input", { type: "number", min: "20", max: "400", value: String(Math.round(tempoAt(s, m))) });
  sec.append(h("div", { class: "row" }, h("label", {}, "Tempo ♩="), tempo, h("button", { onClick: () => void A.edit("setTempo", m, Number(tempo.value)) }, "Áp dụng")));

  const mark = h("input", { type: "text", value: s.timeline[m].rehearsal ?? "", placeholder: "A, B, …" });
  sec.append(h("div", { class: "row" }, h("label", {}, "Dấu tập"), mark, h("button", { onClick: () => void A.edit("setRehearsalMark", m, mark.value) }, "Đặt")));

  s.parts.forEach((part, pi) => {
    for (let staff = 1; staff <= part.staves; staff++) {
      const c = clefAt(part, staff, m);
      const clefSel = h("select", { onChange: (e: Event) => void A.edit("setClef", pi, staff, m, CLEFS[Number((e.target as HTMLSelectElement).value)].clef) });
      CLEFS.forEach((o, i) => {
        const opt = h("option", { value: String(i) }, o.label);
        if (o.clef.sign === c.sign && o.clef.line === c.line && (o.clef.octaveChange ?? 0) === (c.octaveChange ?? 0)) opt.selected = true;
        clefSel.append(opt);
      });
      const label = s.parts.length > 1 || part.staves > 1 ? `Khoá ${s.parts.length > 1 ? pi + 1 : ""}${part.staves > 1 ? "." + staff : ""}` : "Khoá";
      sec.append(h("div", { class: "row" }, h("label", {}, label), clefSel));
    }
  });

  sec.append(
    h(
      "div",
      { class: "row" },
      h("button", { onClick: () => void A.edit("insertMeasures", from, 1) }, "Chèn trước"),
      h("button", { onClick: () => void A.edit("insertMeasures", to + 1, 1) }, "Chèn sau"),
      h("button", { onClick: () => void A.edit("clearMeasures", { from, to }) }, "Xoá nội dung"),
      h("button", { class: "danger", onClick: () => void A.edit("deleteMeasures", from, to) }, "Xoá ô nhịp"),
    ),
  );
  return sec;
}

async function applyTime(measure: number, beats: number, beatType: number): Promise<void> {
  if (!(await A.edit("setTimeSignature", measure, { beats, beatType }))) {
    // Refused because notes would no longer fit: offer to drop the overflow.
    if ($("status-msg").textContent?.includes("more music") && confirm("Một số nốt không còn vừa nhịp mới. Cắt bớt các nốt dư?")) {
      await A.edit("setTimeSignature", measure, { beats, beatType }, { force: true });
    }
  }
}

function sectionScore(s: Score): HTMLElement {
  const sec = h("section", {}, h("h3", {}, "Bản nhạc"));
  const title = h("input", { type: "text", value: s.title, placeholder: "Tên bản nhạc" });
  const composer = h("input", { type: "text", value: s.composer ?? "", placeholder: "Tác giả" });
  const commit = () => {
    if (title.value !== s.title || composer.value !== (s.composer ?? "")) void A.edit("setTitle", title.value, composer.value);
  };
  title.addEventListener("change", commit);
  composer.addEventListener("change", commit);
  sec.append(h("div", { class: "row" }, h("label", {}, "Tên"), title), h("div", { class: "row" }, h("label", {}, "Tác giả"), composer));

  const { from, to } = A.measureRange();
  sec.append(
    h(
      "div",
      { class: "row" },
      h("label", {}, "Dịch cả bài"),
      h("button", { onClick: () => void A.edit("transposeScore", -12) }, "−8ve"),
      h("button", { onClick: () => void A.edit("transposeScore", -1) }, "−½"),
      h("button", { onClick: () => void A.edit("transposeScore", 1) }, "+½"),
      h("button", { onClick: () => void A.edit("transposeScore", 12) }, "+8ve"),
    ),
    h(
      "div",
      { class: "row" },
      h("label", {}, "Dịch vùng"),
      h("button", { title: "Các ô nhịp đang chọn, −1 cung", onClick: () => void A.edit("transposeRange", { from, to }, -2) }, "−1 cung"),
      h("button", { title: "Các ô nhịp đang chọn, +1 cung", onClick: () => void A.edit("transposeRange", { from, to }, 2) }, "+1 cung"),
    ),
  );

  const size = h("select", {
    onChange: (e: Event) =>
      void A.enqueue(async () => {
        A.apply(await api.setStaffSize(Number((e.target as HTMLSelectElement).value)));
      }),
  });
  for (const mm of [5, 6, 7.2, 8, 10, 12]) {
    const o = h("option", { value: String(mm) }, `${mm} mm`);
    if (mm === S.st.staffMm) o.selected = true;
    size.append(o);
  }
  sec.append(h("div", { class: "row" }, h("label", {}, "Cỡ khuông"), size));

  if (S.st.warnings.length) sec.append(h("div", { class: "warn" }, "Khi nhập: " + S.st.warnings.join(" · ")));
  if (S.st.issues) {
    sec.append(h("div", { class: "warn" }, `${S.st.issues} ô có độ dài không khớp nhịp (có thể do nhận dạng sai hoặc có nhịp lấy đà). Hãy đối chiếu bản gốc.`));
  }
  return sec;
}

function sectionParts(s: Score): HTMLElement {
  const sec = h("section", {}, h("h3", {}, "Bè / nhạc cụ"));
  s.parts.forEach((p, pi) => {
    const name = h("input", { type: "text", value: p.name });
    name.addEventListener("change", () => void A.edit("renamePart", pi, name.value));
    const inst = h("select", { onChange: (e: Event) => void A.edit("setInstrument", pi, Number((e.target as HTMLSelectElement).value)) });
    const options = INSTRUMENTS.some((i) => i.program === p.midiProgram) ? INSTRUMENTS : [...INSTRUMENTS, { program: p.midiProgram, name: instrumentName(p.midiProgram) }];
    for (const i of options) {
      const o = h("option", { value: String(i.program) }, i.name);
      if (i.program === p.midiProgram) o.selected = true;
      inst.append(o);
    }
    const staves = h("select", { onChange: (e: Event) => void A.edit("setStaves", pi, Number((e.target as HTMLSelectElement).value)) });
    for (const n of [1, 2, 3]) {
      const o = h("option", { value: String(n) }, `${n} khuông`);
      if (n === p.staves) o.selected = true;
      staves.append(o);
    }
    sec.append(
      h(
        "div",
        { class: "part" },
        h("div", { class: "row" }, name),
        h("div", { class: "row" }, inst),
        h("div", { class: "row" }, staves, h("button", { class: "danger", disabled: s.parts.length === 1, onClick: () => void A.edit("removePart", pi) }, "Xoá bè")),
      ),
    );
  });
  const addSel = h("select", {});
  for (const i of INSTRUMENTS) addSel.append(h("option", { value: String(i.program) }, i.name));
  sec.append(
    h("div", { class: "row" }, addSel, h("button", { onClick: () => void A.edit("addPart", { name: instrumentName(Number(addSel.value)), midiProgram: Number(addSel.value), staves: Number(addSel.value) === 0 ? 2 : 1 }) }, "Thêm bè")),
  );
  return sec;
}

hooks.renderPanels = () => {
  renderNoteBar();
  renderProperties();
};

buildPalette();
