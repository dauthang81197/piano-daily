import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { DEFAULT_VIEW_SETTINGS, VIEW_LIMITS, type ViewSettings } from '@/lib/midi/scene3d/view-settings';
import { ViewSettingsPanel } from './view-settings-panel';

function setup(value: ViewSettings = { ...DEFAULT_VIEW_SETTINGS }, locale: 'vi' | 'en' = 'vi') {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const view = render(withIntl(<ViewSettingsPanel id="panel" value={value} onChange={onChange} onReset={onReset} />, locale));
  return { onChange, onReset, ...view };
}

describe('ViewSettingsPanel', () => {
  it('có nhãn tiếng Việt cho nhóm, ba thanh trượt và ba ô màu', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Tuỳ chỉnh góc nhìn và màu của cảnh 3D' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Góc nâng/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Xoay trái – phải/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Độ gần/)).toBeInTheDocument();
    expect(screen.getByLabelText('Màu bàn tay')).toBeInTheDocument();
    expect(screen.getByLabelText('Màu nốt rơi (phím trắng)')).toBeInTheDocument();
    expect(screen.getByLabelText('Màu nốt rơi (phím đen)')).toBeInTheDocument();
  });

  it('nhãn tiếng Anh', () => {
    setup({ ...DEFAULT_VIEW_SETTINGS }, 'en');
    expect(screen.getByLabelText(/Tilt/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hand color')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument();
  });

  it('thanh trượt dùng đúng giới hạn và có aria-valuetext kèm đơn vị', () => {
    setup({ ...DEFAULT_VIEW_SETTINGS, elevation: 40, azimuth: -10, zoom: 1.25 });
    const elevation = screen.getByLabelText(/Góc nâng/);
    expect(elevation).toHaveAttribute('min', String(VIEW_LIMITS.elevation.min));
    expect(elevation).toHaveAttribute('max', String(VIEW_LIMITS.elevation.max));
    expect(elevation).toHaveAttribute('aria-valuetext', '40 độ');
    expect(screen.getByLabelText(/Xoay trái – phải/)).toHaveAttribute('aria-valuetext', '-10 độ');
    expect(screen.getByLabelText(/Độ gần/)).toHaveAttribute('aria-valuetext', '1,25 lần');
  });

  it('tên truy cập của thanh trượt chỉ gồm nhãn (giá trị đọc qua aria-valuetext, không đọc hai lần)', () => {
    setup({ ...DEFAULT_VIEW_SETTINGS, elevation: 40 });
    expect(screen.getByRole('slider', { name: 'Góc nâng' })).toHaveAttribute('aria-valuetext', '40 độ');
    expect(screen.getByRole('slider', { name: 'Xoay trái – phải' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Độ gần' })).toBeInTheDocument();
  });

  it('độ gần hiển thị theo ngôn ngữ và luôn có chữ số lẻ: vi 1,0 và 1,25; en 1.0 và 1.25', () => {
    const vi_ = setup({ ...DEFAULT_VIEW_SETTINGS, zoom: 1 });
    expect(screen.getByRole('slider', { name: 'Độ gần' })).toHaveAttribute('aria-valuetext', '1,0 lần');
    vi_.unmount();
    const en = setup({ ...DEFAULT_VIEW_SETTINGS, zoom: 1.25 }, 'en');
    expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveAttribute('aria-valuetext', '1.25x');
    en.unmount();
    setup({ ...DEFAULT_VIEW_SETTINGS, zoom: 1 }, 'en');
    expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveAttribute('aria-valuetext', '1.0x');
  });

  it('kéo thanh trượt gọi onChange ngay với giá trị mới, giữ nguyên các trường khác', () => {
    const { onChange } = setup({ ...DEFAULT_VIEW_SETTINGS, handColor: '#112233' });
    fireEvent.change(screen.getByLabelText(/Góc nâng/), { target: { value: '33' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW_SETTINGS, handColor: '#112233', elevation: 33 });
    fireEvent.change(screen.getByLabelText(/Độ gần/), { target: { value: '1.4' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW_SETTINGS, handColor: '#112233', zoom: 1.4 });
  });

  it('đổi màu gọi onChange với màu chữ thường; màu sai định dạng bị bỏ qua', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Màu bàn tay'), { target: { value: '#3366ff' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW_SETTINGS, handColor: '#3366ff' });
    fireEvent.change(screen.getByLabelText('Màu nốt rơi (phím đen)'), { target: { value: '#aabbcc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW_SETTINGS, noteBlackColor: '#aabbcc' });
  });

  it('nút đặt lại bị vô hiệu khi đang là mặc định, bấm được khi đã chỉnh và gọi onReset', () => {
    const first = setup();
    expect(screen.getByRole('button', { name: 'Đặt lại mặc định' })).toBeDisabled();
    expect(first.onReset).not.toHaveBeenCalled();
    first.unmount();
    const second = setup({ ...DEFAULT_VIEW_SETTINGS, zoom: 1.3 });
    const button = screen.getByRole('button', { name: 'Đặt lại mặc định' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(second.onReset).toHaveBeenCalledTimes(1);
  });
});
