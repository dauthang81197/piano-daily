/**
 * Một nguồn âm thanh tại một thời điểm trên toàn trang: MIDI player chính (Story 2.8) và nghe thử trên thẻ (Story 2.9)
 * dùng chung để bắt đầu nguồn này thì dừng nguồn kia (trang chi tiết có cả hai: player và thẻ liên quan).
 */
let current: { owner: string; stop: () => void } | null = null;

/**
 * Nhận quyền phát: nếu một chủ khác đang giữ thì gọi `stop` của họ. Trả hàm nhả quyền (chỉ có tác dụng nếu vẫn là
 * người giữ). Cùng một chủ nhận lại thì chỉ thay `stop`, không tự dừng chính mình.
 */
export function claimAudio(owner: string, stop: () => void): () => void {
  if (current && current.owner !== owner) {
    const previous = current;
    current = null;
    previous.stop();
  }
  const mine = { owner, stop };
  current = mine;
  return () => {
    if (current === mine) current = null;
  };
}

/** Chỉ dùng trong test: xoá trạng thái chung. */
export function resetAudioClaims(): void {
  current = null;
}
