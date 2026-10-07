import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JsonLd } from './json-ld';

describe('JsonLd', () => {
  it('render một script ld+json có JSON parse được', () => {
    const { container } = render(<JsonLd data={{ '@type': 'Thing', name: 'x' }} />);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(JSON.parse(script.textContent ?? '')).toEqual({ '@type': 'Thing', name: 'x' });
  });

  it('không có dữ liệu (null/undefined) thì không render gì', () => {
    expect(render(<JsonLd data={null} />).container).toBeEmptyDOMElement();
    expect(render(<JsonLd data={undefined} />).container).toBeEmptyDOMElement();
  });

  it('dữ liệu có </script> không thoát khỏi thẻ (chỉ đúng một script, không phần tử lạ)', () => {
    const { container } = render(<JsonLd data={{ name: '</script><img src=x onerror=alert(1)>' }} />);
    expect(container.querySelectorAll('script')).toHaveLength(1);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')!.innerHTML).not.toMatch(/[<>]/);
    expect(JSON.parse(container.querySelector('script')!.textContent ?? '').name).toBe('</script><img src=x onerror=alert(1)>');
  });
});
