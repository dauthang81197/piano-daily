'use client';

import { Component, type ReactNode } from 'react';

/** Lỗi khi nạp/dựng khuông nhạc (kể cả chunk lazy không tải được) chỉ ẩn khuông, không làm hỏng player. */
export class NotationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
