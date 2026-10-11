# Backup Postgres hằng đêm lên bucket private R2 (Story 5.2). Cùng major với DB (postgres:18.6) để pg_dump khớp phiên bản.
FROM postgres:18.6

# AWS CLI v2 từ bản zip chính thức (Debian trixie không có gói awscli đáng tin cậy); gỡ unzip sau khi cài, GIỮ curl để backup.sh báo lỗi qua API (Story 5.3).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata curl unzip \
 && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip \
 && unzip -q /tmp/awscliv2.zip -d /tmp \
 && /tmp/aws/install \
 && aws --version \
 && rm -rf /tmp/aws /tmp/awscliv2.zip \
 && apt-get purge -y --auto-remove unzip \
 && rm -rf /var/lib/apt/lists/*

COPY backup.sh backup-loop.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/backup-loop.sh /usr/local/bin/restore.sh

ENV TZ=Asia/Ho_Chi_Minh
ENTRYPOINT []
CMD ["/usr/local/bin/backup-loop.sh"]
