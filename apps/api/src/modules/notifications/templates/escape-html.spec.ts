import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes the five reserved HTML characters', () => {
    expect(escapeHtml(`<script>alert('x') & "y"</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;) &amp; &quot;y&quot;&lt;/script&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Audífonos Bluetooth')).toBe('Audífonos Bluetooth');
  });
});
