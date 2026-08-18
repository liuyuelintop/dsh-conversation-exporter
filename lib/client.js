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
    const { jsx, jsxs } = require('react/jsx-runtime');

    const EXPORT_PATH = '/api/conversation.export';
    const TURNS_PATH = '/api/conversation.turns';
    const STYLE_ID = 'dsh-conversation-exporter/action';
    const STYLE = '.dshConversationExportControls{display:flex;align-items:center;gap:6px}.dshConversationExportAction{border:1px solid var(--dsw-alias-border-l2);height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:transparent;border-radius:18px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;white-space:nowrap}.dshConversationExportAction:hover:not(:disabled),.dshConversationTurnButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dshConversationExportAction:disabled,.dshConversationTurnButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:not-allowed}.dshConversationSelectAction{border-color:transparent;padding-left:8px;padding-right:8px}.dshConversationTurnOverlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.42)}.dshConversationTurnDialog{box-sizing:border-box;display:flex;flex-direction:column;width:min(680px,100%);max-height:min(760px,calc(100vh - 48px));overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-shadow:0 18px 48px rgba(0,0,0,.28)}.dshConversationTurnHeader,.dshConversationTurnToolbar,.dshConversationTurnFooter{display:flex;align-items:center;gap:10px;padding:14px 18px}.dshConversationTurnHeader{justify-content:space-between;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshConversationTurnHeader h2{margin:0;font-size:16px;line-height:24px}.dshConversationTurnToolbar{padding-top:10px;padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshConversationTurnCount{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px}.dshConversationTurnButton{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}.dshConversationTurnButtonPrimary{background:var(--dsw-alias-interactive-bg-primary,var(--dsw-alias-label-primary));color:var(--dsw-alias-label-on-primary,#fff)}.dshConversationTurnClose{border:0;padding:4px 8px;font-size:20px;line-height:20px}.dshConversationTurnBody{min-height:120px;overflow-y:auto;padding:8px 18px}.dshConversationTurnList{list-style:none;margin:0;padding:0}.dshConversationTurnItem{border-bottom:1px solid var(--dsw-alias-border-l2)}.dshConversationTurnItem:last-child{border-bottom:0}.dshConversationTurnLabel{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;padding:12px 2px;cursor:pointer}.dshConversationTurnLabel input{margin-top:3px}.dshConversationTurnOrdinal{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}.dshConversationTurnPreview{margin-top:3px;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:13px;line-height:19px;text-overflow:ellipsis;white-space:nowrap}.dshConversationTurnPreviewAssistant{color:var(--dsw-alias-label-secondary)}.dshConversationTurnEmpty,.dshConversationTurnStatus{margin:16px 0;color:var(--dsw-alias-label-secondary);font-size:13px}.dshConversationTurnError{margin:8px 18px 0;color:var(--dsw-alias-label-error,#b42318);font-size:12px}.dshConversationTurnFooter{justify-content:flex-end;border-top:1px solid var(--dsw-alias-border-l2)}';

    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-conversation-exporter';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    function responseFilename(response) {
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      if (encoded !== undefined) {
        try {
          const filename = decodeURIComponent(encoded);
          if (filename.endsWith('.md') && !/[\\/\u0000-\u001F\u007F]/u.test(filename)) return filename;
        } catch {
          // Fall through to the stable local fallback.
        }
      }
      return 'dsh-conversation.md';
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

    async function post(path, body) {
      const url = new URL(path, hostBase());
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Export failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`);
      }
      return response;
    }

    async function downloadConversation(sessionId, selection = undefined) {
      const body = selection === undefined ? { sessionId } : { sessionId, selection };
      const response = await post(EXPORT_PATH, body);
      saveMarkdown(await response.text(), responseFilename(response));
    }

    async function readTurns(sessionId) {
      const response = await post(TURNS_PATH, { sessionId });
      const value = await response.json();
      if (value === null || typeof value !== 'object' || !Array.isArray(value.turns)) {
        throw new Error('Export failed: invalid turn list');
      }
      return value.turns.map((turn, position) => {
        if (turn === null
          || typeof turn !== 'object'
          || turn.index !== position
          || typeof turn.human !== 'string'
          || !(typeof turn.assistant === 'string' || turn.assistant === null)) {
          throw new Error('Export failed: invalid turn list');
        }
        return { index: turn.index, human: turn.human, assistant: turn.assistant };
      });
    }

    function compactSelection(selected, turnCount) {
      const included = Array.from(selected).sort((left, right) => left - right);
      let selection;
      if (included.length <= turnCount - included.length) {
        selection = { include: included };
      } else {
        const excluded = [];
        for (let index = 0; index < turnCount; index++) {
          if (!selected.has(index)) excluded.push(index);
        }
        selection = { exclude: excluded };
      }
      if (JSON.stringify(selection).length <= 2048) return { ...selection, count: turnCount };

      const bytes = new Uint8Array(Math.ceil(turnCount / 8));
      for (const index of selected) bytes[index >> 3] |= 1 << (index & 7);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { bits: btoa(binary), count: turnCount };
    }

    function ExportChatAction({ sessionId }) {
      const [fullExport, setFullExport] = React.useState({ status: 'idle', error: null });
      const [selector, setSelector] = React.useState({
        open: false,
        sessionId: null,
        status: 'idle',
        turns: [],
        selected: new Set(),
        error: null,
      });
      const fullBusy = fullExport.status === 'downloading';
      const selectorActive = selector.open && selector.sessionId === sessionId;
      const selectorBusy = selector.status === 'loading' || selector.status === 'exporting';
      const fullLabel = fullBusy
        ? 'Exporting…'
        : fullExport.status === 'error' ? 'Export failed' : 'Export Chat';

      const openSelector = async () => {
        setSelector({
          open: true,
          sessionId,
          status: 'loading',
          turns: [],
          selected: new Set(),
          error: null,
        });
        try {
          const turns = await readTurns(sessionId);
          setSelector((current) => current.sessionId === sessionId ? {
            ...current,
            status: 'ready',
            turns,
            selected: new Set(turns.map((turn) => turn.index)),
          } : current);
        } catch (caught) {
          setSelector((current) => current.sessionId === sessionId ? {
            ...current,
            status: 'error',
            error: caught instanceof Error ? caught.message : String(caught),
          } : current);
        }
      };

      const fullButton = jsx('button', {
        type: 'button',
        className: 'dshConversationExportAction',
        disabled: fullBusy,
        'aria-busy': fullBusy,
        title: fullExport.error ?? 'Download this conversation as clean Markdown',
        onClick: async () => {
          setFullExport({ status: 'downloading', error: null });
          try {
            await downloadConversation(sessionId);
            setFullExport({ status: 'idle', error: null });
          } catch (caught) {
            setFullExport({
              status: 'error',
              error: caught instanceof Error ? caught.message : String(caught),
            });
          }
        },
        children: fullLabel,
      });

      const selectButton = jsx('button', {
        type: 'button',
        className: 'dshConversationExportAction dshConversationSelectAction',
        disabled: selector.status === 'loading',
        title: 'Choose conversation turns to export',
        onClick: openSelector,
        children: selector.status === 'loading' && selector.sessionId === sessionId ? 'Loading turns…' : 'Select turns…',
      });

      let dialog = null;
      if (selectorActive) {
        const ready = selector.status === 'ready' || selector.status === 'exporting';
        const selectionCount = selector.selected.size;
        let body;
        if (selector.status === 'loading') {
          body = jsx('p', { className: 'dshConversationTurnStatus', children: 'Loading conversation turns…' });
        } else if (selector.status === 'error') {
          body = jsxs('div', {
            children: [
              jsx('p', { className: 'dshConversationTurnStatus', children: 'Conversation turns could not be loaded.' }),
              jsx('button', {
                type: 'button',
                className: 'dshConversationTurnButton',
                onClick: openSelector,
                children: 'Try again',
              }),
            ],
          });
        } else if (selector.turns.length === 0) {
          body = jsx('p', { className: 'dshConversationTurnEmpty', children: 'No conversation turns are available to export.' });
        } else {
          body = jsx('ul', {
            className: 'dshConversationTurnList',
            children: selector.turns.map((turn) => jsx('li', {
              className: 'dshConversationTurnItem',
              children: jsxs('label', {
                className: 'dshConversationTurnLabel',
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: selector.selected.has(turn.index),
                    disabled: selectorBusy,
                    onChange: (event) => setSelector((current) => {
                      const selected = new Set(current.selected);
                      if (event.target.checked) selected.add(turn.index);
                      else selected.delete(turn.index);
                      return { ...current, selected, error: null };
                    }),
                  }),
                  jsxs('span', {
                    children: [
                      jsx('span', { className: 'dshConversationTurnOrdinal', children: `Turn ${turn.index + 1}` }),
                      jsx('div', { className: 'dshConversationTurnPreview', children: `Human: ${turn.human}` }),
                      jsx('div', {
                        className: 'dshConversationTurnPreview dshConversationTurnPreviewAssistant',
                        children: turn.assistant === null
                          ? 'Response incomplete.'
                          : `Assistant: ${turn.assistant}`,
                      }),
                    ],
                  }),
                ],
              }),
            }, turn.index)),
          });
        }

        dialog = jsx('div', {
          className: 'dshConversationTurnOverlay',
          children: jsxs('div', {
            className: 'dshConversationTurnDialog',
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'dsh-conversation-turn-title',
            onKeyDown: (event) => {
              if (event.key === 'Escape' && !selectorBusy) {
                setSelector((current) => ({ ...current, open: false }));
              }
            },
            children: [
              jsxs('div', {
                className: 'dshConversationTurnHeader',
                children: [
                  jsx('h2', { id: 'dsh-conversation-turn-title', children: 'Select conversation turns' }),
                  jsx('button', {
                    type: 'button',
                    className: 'dshConversationTurnButton dshConversationTurnClose',
                    disabled: selectorBusy,
                    'aria-label': 'Close turn selector',
                    onClick: () => setSelector((current) => ({ ...current, open: false })),
                    children: '×',
                  }),
                ],
              }),
              ready ? jsxs('div', {
                className: 'dshConversationTurnToolbar',
                children: [
                  jsx('button', {
                    type: 'button',
                    className: 'dshConversationTurnButton',
                    disabled: selectorBusy || selectionCount === selector.turns.length,
                    onClick: () => setSelector((current) => ({
                      ...current,
                      selected: new Set(current.turns.map((turn) => turn.index)),
                      error: null,
                    })),
                    children: 'Select all',
                  }),
                  jsx('button', {
                    type: 'button',
                    className: 'dshConversationTurnButton',
                    disabled: selectorBusy || selectionCount === 0,
                    onClick: () => setSelector((current) => ({ ...current, selected: new Set(), error: null })),
                    children: 'Clear',
                  }),
                  jsx('span', {
                    className: 'dshConversationTurnCount',
                    children: `${selectionCount} of ${selector.turns.length} selected`,
                  }),
                ],
              }) : null,
              selector.error !== null && selector.status !== 'error'
                ? jsx('p', { className: 'dshConversationTurnError', role: 'alert', children: selector.error })
                : null,
              jsx('div', { className: 'dshConversationTurnBody', children: body }),
              jsxs('div', {
                className: 'dshConversationTurnFooter',
                children: [
                  jsx('button', {
                    type: 'button',
                    className: 'dshConversationTurnButton',
                    disabled: selectorBusy,
                    onClick: () => setSelector((current) => ({ ...current, open: false })),
                    children: 'Cancel',
                  }),
                  jsx('button', {
                    type: 'button',
                    className: 'dshConversationTurnButton dshConversationTurnButtonPrimary',
                    disabled: !ready || selectorBusy || selectionCount === 0,
                    'aria-busy': selector.status === 'exporting',
                    onClick: async () => {
                      if (selectionCount === 0) return;
                      setSelector((current) => ({ ...current, status: 'exporting', error: null }));
                      try {
                        await downloadConversation(
                          sessionId,
                          compactSelection(selector.selected, selector.turns.length),
                        );
                        setSelector((current) => current.sessionId === sessionId
                          ? { ...current, open: false, status: 'ready' }
                          : current);
                      } catch (caught) {
                        setSelector((current) => current.sessionId === sessionId ? {
                          ...current,
                          status: 'ready',
                          error: caught instanceof Error ? caught.message : String(caught),
                        } : current);
                      }
                    },
                    children: selector.status === 'exporting' ? 'Exporting…' : 'Export selected turns',
                  }),
                ],
              }),
            ],
          }),
        });
      }

      return jsxs('div', {
        className: 'dshConversationExportControls',
        children: [fullButton, selectButton, dialog],
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
