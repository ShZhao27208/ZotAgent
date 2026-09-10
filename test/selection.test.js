import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../plugin/content/zot-agent.js', import.meta.url), 'utf8');
const sandbox = { Zotero: {} };
vm.runInNewContext(source.replace(
  'Zotero.ZotAgent = { hooks, controllers, runtimeManager: RuntimeManager };',
  'Zotero.ZotAgent = { MainWindowController };',
), sandbox);

function fixture() {
  const controller = Object.create(sandbox.Zotero.ZotAgent.MainWindowController.prototype);
  const published = [];
  controller.dialogs = new Map([['panel', { receiveSelection: value => published.push(value) }]]);
  const annotation = { text: 'petroleum', position: { pageIndex: 2 } };
  const reader = {
    _item: { id: 123 },
    _iframeWindow: { document: { defaultView: { getSelection: () => ({ toString: () => 'ally seen.' }) } } },
    _internalReader: {
      _primaryView: {}, _secondaryView: {},
      _state: { primaryViewSelectionPopup: { annotation } },
    },
  };
  const publish = event => {
    const value = controller._readReaderSelection(reader, event);
    controller._publishReaderSelection(reader, value.text, value.annotation);
  };
  return { controller, reader, annotation, published, publish };
}

test('native event text and page survive subsequent polling with stale DOM and popup state', () => {
  const { reader, annotation, published, publish } = fixture();
  publish({ params: { annotation } });
  reader._internalReader._state.primaryViewSelectionPopup.annotation = { text: 'old selection' };
  publish();
  assert.equal(published.length, 1);
  assert.equal(published[0].text, 'petroleum');
  assert.equal(published[0].pageIndex, 2);
  publish({ params: { text: 'Recently, with the increase in environmental concerns' } });
  assert.equal(published.length, 2);
  assert.match(published[1].text, /^Recently/);
});

test('poll fallback uses native annotation instead of unrelated DOM selection', () => {
  const { published, publish } = fixture();
  publish();
  assert.equal(published[0].text, 'petroleum');
  assert.equal(published[0].pageIndex, 2);
});

test('active secondary view never falls back to stale primary selection', () => {
  const { controller, reader } = fixture();
  reader._internalReader._lastView = reader._internalReader._secondaryView;
  assert.equal(controller._readReaderSelection(reader).text, '');
  reader._internalReader._state.secondaryViewSelectionPopup = { annotation: { text: 'secondary' } };
  assert.equal(controller._readReaderSelection(reader).text, 'secondary');
});

test('DOM-only selections do not publish, including when native popup is empty', () => {
  const { reader, published, publish } = fixture();
  reader._internalReader._state = {};
  publish();
  publish({ params: {}, doc: reader._iframeWindow.document });
  assert.equal(published.length, 0);
});

test('native event ownership is isolated per reader', () => {
  const { controller, reader, annotation } = fixture();
  controller._readReaderSelection(reader, { params: { annotation } });
  const other = fixture().reader;
  assert.equal(controller._readReaderSelection(other).text, 'petroleum');
  assert.equal(controller._readReaderSelection(reader).text, '');
});
