/**
 * The slide-sized editor: eChant's chant workspace with everything that needs a
 * backend taken out. The three panes are the app's own components over the app's
 * own document store; only the chrome around them is written here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Divider, IconButton, ScopedCssBaseline, Stack, ThemeProvider, Tooltip, Typography, createTheme } from '@mui/material';
import { RedoOutlined, UndoOutlined } from '@mui/icons-material';

import { AnnotationCanvas } from '@echant/components/AnnotationCanvas';
import { EditorHelpHint } from '@echant/components/help/EditorHelpHint';
import { Canvas as MusicCanvas } from '@echant/editor/Canvas';
import { Inspector } from '@echant/editor/inspector/Inspector';
import { useElementSize } from '@echant/editor/utils/useElementSize';
import { getPageDocument } from '@echant/document/pageDocumentService';
import { ensureDocIds } from '@echant/document/identity';
import { loadDoc, redo, undo, useCanRedo, useCanUndo } from '@echant/document/store';
import { PageDocument } from '@echant/document/types';
import { useDocument } from '@echant/editor/store';
import { getChantDocument } from '@echant/services/chantDocumentService';
import { getChant } from '@echant/services/chantService';

import { CHANT_ID, PAGE_ID } from './demoApi';

const theme = createTheme({ typography: { fontFamily: '"Inter", system-ui, sans-serif' } });

export interface DemoEditorProps {
  facsimileWidth: string;
  /** The app's ambient editing-hints overlay. It sits over the music pane, so a
   *  slide that is showing the notation wants it off. */
  hints: boolean;
  /** Bumped by the host to force a re-layout after the slide becomes visible. */
  revision: number;
  /** Bumped to reload the chant in place, without tearing the panes down. */
  reloadToken: number;
  onCaretChange: () => void;
  onReady: () => void;
}

/** The caret lives in the editor's own store, which is not exported. Reading it
 *  through the app's hook is the supported way to hear a selection change. */
function CaretBridge({ onChange }: { onChange: () => void }) {
  const music = useDocument((doc) => doc.music);
  useEffect(onChange, [music, onChange]);
  return null;
}

/** Fetch the chant + its folio image through the app's real service layer (which
 *  the build points at the bundled payloads) and seed the document store. */
async function loadChant(): Promise<{ title: string; image: { data_url: string; width: number; height: number } }> {
  const [document, chant, page] = await Promise.all([
    getChantDocument(CHANT_ID).then(ensureDocIds),
    getChant(CHANT_ID),
    getPageDocument(PAGE_ID),
  ]);
  loadDoc(document as unknown as PageDocument, 'chant', {
    id: CHANT_ID,
    versions: document.versions,
    pages: document.pages.map((p) => ({ id: p.id, folio_label: p.folio_label })),
  });
  return { title: chant.title || chant.incipit || 'Chant', image: page.image };
}

export function DemoEditor({ facsimileWidth, hints, revision, reloadToken, onCaretChange, onReady }: DemoEditorProps) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadChant>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const [canvasBox, setCanvasBox] = useState({ width: 100, height: 100 });
  useElementSize(canvasBoxRef, setCanvasBox);

  // A fresh image object re-derives the canvas projection, which is what makes
  // the facsimile redraw itself against the pane's new size — AnnotationCanvas
  // sizes its backing store inside the draw effect, not on a resize.
  const pageImage = useMemo(
    () => (loaded ? { ...loaded.image } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, revision, reloadToken],
  );

  useEffect(() => {
    let cancelled = false;
    loadChant().then(
      (result) => {
        if (cancelled) return;
        setLoaded(result);
        onReady();
      },
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [onReady, reloadToken]);

  // Ctrl/Cmd+Z drives the document store's single undo timeline, as in the app.
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'z') return;
    if (event.shiftKey) redo();
    else undo();
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (error) {
    return (
      <Box className="echant-demo-message" role="alert">
        {error}
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <ScopedCssBaseline sx={{ height: '100%' }}>
        <Stack direction="column" sx={{ height: '100%' }} tabIndex={-1} onKeyDown={onKeyDown}>
          <CaretBridge onChange={onCaretChange} />
          <Box className="echant-demo-bar">
            <Typography component="span" className="echant-demo-title">
              {loaded?.title ?? 'eChant'}
            </Typography>
            <Typography component="span" className="echant-demo-source">
              St. Gallen, Stiftsbibliothek, Cod. Sang. 338, S. 75
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Rückgängig (Ctrl/Cmd+Z)">
              <span>
                <IconButton size="small" data-demo="undo" onClick={undo} disabled={!canUndo}>
                  <UndoOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Wiederherstellen (Ctrl/Cmd+Shift+Z)">
              <span>
                <IconButton size="small" data-demo="redo" onClick={redo} disabled={!canRedo}>
                  <RedoOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
            <Stack
              direction="column"
              sx={{ flex: '1 1 auto', minWidth: 0, borderRight: '1px solid', borderColor: 'divider' }}
            >
              <Box ref={canvasBoxRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {loaded && <MusicCanvas height={canvasBox.height} />}
                {loaded && hints && <EditorHelpHint />}
              </Box>
              <Divider />
              <Box className="echant-demo-inspector">{loaded && <Inspector />}</Box>
            </Stack>

            <Box sx={{ flex: `0 0 ${facsimileWidth}`, minWidth: 0, display: 'flex', overflow: 'hidden', p: 1 }}>
              {pageImage && <AnnotationCanvas displayPageId={PAGE_ID} pageImage={pageImage} />}
            </Box>
          </Box>
        </Stack>
      </ScopedCssBaseline>
    </ThemeProvider>
  );
}
