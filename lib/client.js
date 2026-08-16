/*
 * DSH client-module artifact. This intentionally ships in the loader's
 * closure-factory format so a local checkout/tarball installs with no build
 * step or third-party build dependency.
 */
window.__ModuleLoader__.load({
  id: 'dsh-conversation-exporter',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const { jsx } = require('react/jsx-runtime');

    const EXPORT_PATH = '/api/conversation.export';
    const STYLE_ID = 'dsh-conversation-exporter/action';
    const STYLE = '.dshConversationExportAction{border:1px solid var(--dsw-alias-border-l2);height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:transparent;border-radius:18px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;white-space:nowrap}.dshConversationExportAction:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dshConversationExportAction:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}';

    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-conversation-exporter';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    function markdownFilename(sessionId) {
      return `dsh-conversation-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.md`;
    }

    function hostBase() {
      const origin = globalThis.location?.origin;
      return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal';
    }

    function saveMarkdown(markdown, filename) {
      const objectUrl = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }

    async function downloadConversation(sessionId) {
      const url = new URL(EXPORT_PATH, hostBase());
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Export failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`);
      }
      saveMarkdown(await response.text(), markdownFilename(sessionId));
    }

    function ExportChatAction({ sessionId }) {
      const [status, setStatus] = React.useState('idle');
      const [error, setError] = React.useState(null);
      const busy = status === 'downloading';
      const label = busy ? 'Exporting…' : status === 'error' ? 'Export failed' : 'Export Chat';
      return jsx('button', {
        type: 'button',
        className: 'dshConversationExportAction',
        disabled: busy,
        'aria-busy': busy,
        title: error ?? 'Download this conversation as clean Markdown',
        onClick: async () => {
          setStatus('downloading');
          setError(null);
          try {
            await downloadConversation(sessionId);
            setStatus('idle');
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
            setStatus('error');
          }
        },
        children: label,
      });
    }

    const inject = ['slots'];

    function apply(ctx) {
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'conversation-exporter',
        label: 'Export Chat',
      }, ExportChatAction));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
