import { useEffect, useRef } from "react";
import {
  getParentBeforeBlock,
  getParentBlock,
  getNextSiblings,
  insertText,
  normalizeCursorSelectionOffsets,
  onCompositionEnd,
  onCompositionStart,
  onFocusIn,
  onInsertFromPaste,
  onKeyDown,
  onSelectionChange,
  removeText,
  spliceTextAtCusor,
  createTextWithStyling,
  useEvent,
} from "./PluginShared";

function onInsertParagraph(event, viewModel, state) {
  const selection = viewModel.getSelection();

  if (selection.isCaret()) {
    const [startOffset] = normalizeCursorSelectionOffsets(selection);
    const anchorNode = selection.getAnchorNode();
    let text = "";

    if (anchorNode.isText()) {
      const currentText = anchorNode.getTextContent();
      text = currentText.slice(startOffset);
      spliceTextAtCusor(
        anchorNode,
        startOffset,
        currentText.length - startOffset,
        "",
        false,
        viewModel,
        state
      );
    }
    const currentBlock = getParentBlock(anchorNode);
    const ancestor = getParentBeforeBlock(anchorNode);
    const siblings = getNextSiblings(ancestor);
    const textNode = anchorNode.isImmutable()
      ? viewModel.createText(text)
      : viewModel.cloneText(anchorNode, text);
    const paragraph = viewModel.createBlock().append(textNode);
    currentBlock.insertAfter(paragraph);
    let nodeToInsertAfter = textNode;
    siblings.forEach((sibling) => {
      nodeToInsertAfter.insertAfter(sibling);
      nodeToInsertAfter = sibling;
    });
    textNode.select(0, 0);
  } else {
    console.log("TODO");
  }
}

function formatBold(evet, viewModel, state) {
  const selection = viewModel.getSelection();
  const selectedNodes = selection.getNodes();
  const [startOffset, difference] = normalizeCursorSelectionOffsets(selection);

  state.isBoldMode = !state.isBoldMode;

  if (!selection.isCaret()) {
    if (selectedNodes.length === 1) {
      const firstNode = selectedNodes[0];

      if (firstNode.isText()) {
        const anchorNode = selection.getAnchorNode();
        const currentBlock = getParentBlock(anchorNode);
        const splitNodes = firstNode.splitText(
          startOffset,
          startOffset + difference
        );
        const nodeToReplace =
          splitNodes.length === 1 || startOffset === 0
            ? splitNodes[0]
            : splitNodes[1];

        const textContent = nodeToReplace.getTextContent();
        const replacement = createTextWithStyling(
          textContent,
          viewModel,
          state,
          nodeToReplace
        );
        nodeToReplace.replace(replacement);
        replacement.select(0, textContent.length);
        currentBlock.normalizeTextNodes(true);
      }
    } else {
      debugger;
    }
  }
}

function onBeforeInput(event, viewModel, state, editor) {
  const inputType = event.inputType;

  if (
    inputType !== "insertCompositionText" &&
    inputType !== "deleteCompositionText"
  ) {
    event.preventDefault();
  }

  switch (inputType) {
    case "formatBold": {
      formatBold(event, viewModel, state);
      break;
    }
    case "insertFromComposition": {
      const data = event.data;
      if (data) {
        insertText(event.data, viewModel, state, true);
      }
      break;
    }
    case "insertFromPaste": {
      onInsertFromPaste(event, viewModel, state, editor);
      break;
    }
    case "insertLineBreak": {
      insertText("\n", viewModel, state, false);
      break;
    }
    case "insertParagraph": {
      onInsertParagraph(event, viewModel, state);
      break;
    }
    case "insertText": {
      insertText(event.data, viewModel, state, false);
      break;
    }
    case "deleteContentBackward": {
      removeText(true, viewModel, state);
      break;
    }
    case "deleteContentForward": {
      removeText(false, viewModel, state);
      break;
    }
    default: {
      console.log("TODO?", inputType);
    }
  }
}

export function useRichTextPlugin(outlineEditor, isReadOnly = false) {
  const pluginStateRef = useRef(null);

  // Handle event plugin state
  useEffect(() => {
    const pluginsState = pluginStateRef.current;

    if (pluginsState === null) {
      pluginStateRef.current = {
        isBoldMode: false,
        isItalicMode: false,
        isUnderlineMode: false,
        isStrikeThroughMode: false,
        isComposing: false,
        isReadOnly,
      };
    } else {
      pluginsState.isReadOnly = isReadOnly;
    }
  }, [isReadOnly]);

  useEvent(outlineEditor, "beforeinput", onBeforeInput, pluginStateRef);
  useEvent(outlineEditor, "focusin", onFocusIn, pluginStateRef);
  useEvent(
    outlineEditor,
    "compositionstart",
    onCompositionStart,
    pluginStateRef
  );
  useEvent(outlineEditor, "compositionend", onCompositionEnd, pluginStateRef);
  useEvent(outlineEditor, "keydown", onKeyDown, pluginStateRef);
  useEvent(outlineEditor, "selectionchange", onSelectionChange, pluginStateRef);
}
