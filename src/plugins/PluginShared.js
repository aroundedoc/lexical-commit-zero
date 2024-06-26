import { useEffect } from "react";

const isBrowserFirefox =
  typeof navigator !== "undefined" &&
  /^(?!.*Seamonkey)(?=.*Firefox).*/i.test(navigator.userAgent);

const isBrowserSafari =
  typeof navigator !== "undefined" &&
  /Version\/[\d.]+.*Safari/.test(navigator.userAgent);

export function normalizeCursorSelectionOffsets(selection) {
  const [anchorOffset, focusOffset] = selection.getRangeOffsets();
  const selectionLeftToRight = focusOffset > anchorOffset;
  const startOffset = selectionLeftToRight ? anchorOffset : focusOffset;
  const endOffset = selectionLeftToRight ? focusOffset : anchorOffset;
  const offsetDifference = endOffset - startOffset;
  return [startOffset, offsetDifference];
}

export function normalizeRangeSelectionOffsets(selection) {
  const [anchorOffset, focusOffset] = selection.getRangeOffsets();
  const anchorNode = selection.getAnchorNode();
  const focusNode = selection.getFocusNode();
  if (anchorNode.isBefore(focusNode)) {
    return [anchorOffset, focusOffset];
  } else {
    return [focusOffset, anchorOffset];
  }
}

export function getParentBeforeBlock(startNode) {
  let node = startNode;
  while (node !== null) {
    const parent = node.getParent();
    if (parent.isBlock()) {
      return node;
    }
    node = parent;
  }
  return null;
}

export function getParentBlock(startNode) {
  let node = startNode;
  while (node !== null) {
    if (node.isBlock()) {
      return node;
    }
    node = node.getParent();
  }
  return null;
}

export function getNextSiblings(startNode) {
  const siblings = [];
  let node = startNode.getNextSibling();
  while (node !== null) {
    siblings.push(node);
    node = node.getNextSibling();
  }
  return siblings;
}

export function createTextWithStyling(text, viewModel, state, targetToClone) {
  const textNode =
    targetToClone && !targetToClone.isImmutable()
      ? viewModel.cloneText(targetToClone, text)
      : viewModel.createText(text);
  if (state.isBoldMode) {
    textNode.makeBold();
  } else {
    textNode.makeNormal();
  }
  return textNode;
}

export function spliceTextAtCusor(
  selectedNode,
  caretOffset,
  delCount,
  text,
  fromComposition,
  viewModel,
  state
) {
  if (selectedNode.isImmutable()) {
    const ancestor = getParentBeforeBlock(selectedNode);
    const currentBlock = ancestor.getParent();

    if (caretOffset === 0) {
      const textNode = createTextWithStyling(
        text,
        viewModel,
        state,
        selectedNode
      );
      ancestor.insertBefore(textNode);
      textNode.select();
    } else {
      const nextSibling = ancestor.getNextSibling();
      if (nextSibling === null) {
        const textNode = createTextWithStyling(
          text,
          viewModel,
          state,
          selectedNode
        );
        ancestor.insertAfter(textNode);
        textNode.select();
      } else {
        const textNode = createTextWithStyling(
          text,
          viewModel,
          state,
          selectedNode
        );
        nextSibling.insertBefore(textNode);
        textNode.select();
      }
    }
    currentBlock.normalizeTextNodes(true);
  } else {
    const isBold = selectedNode.isBold();
    selectedNode.spliceText(caretOffset, delCount, text, true, false);

    if ((!isBold && state.isBoldMode) || (isBold && !state.isBoldMode)) {
      let textContent = selectedNode.getTextContent();
      let targetNode;

      if (caretOffset === 0) {
        targetNode = selectedNode;
      } else {
        [, targetNode] = selectedNode.splitText(
          caretOffset,
          textContent.length - 1
        );
        textContent = targetNode.getTextContent();
      }
      const replacementNode = createTextWithStyling(
        text,
        viewModel,
        state,
        selectedNode
      );
      targetNode.replace(replacementNode);
      replacementNode.select();
    }
  }
}

function spliceTextAtRange(
  text,
  selection,
  selectedNodes,
  fromComposition,
  viewModel,
  state
) {
  const [firstNode, ...nodesToRemove] = selectedNodes;
  if (firstNode.isImmutable()) {
    const ancestor = getParentBeforeBlock(firstNode);
    const currentBlock = ancestor.getParent();
    const textNode = viewModel.createText(text);
    ancestor.insertBefore(textNode);
    textNode.select();
    selectedNodes.forEach((node) => {
      if (!node.isParentOf(firstNode)) {
        node.remove();
      }
    });
    if (firstNode.isImmutable()) {
      ancestor.remove();
    }
    currentBlock.normalizeTextNodes(true);
  } else {
    const [startOffset, endOffset] = normalizeRangeSelectionOffsets(selection);
    nodesToRemove.forEach((node) => {
      if (!node.isParentOf(firstNode)) {
        node.remove();
      }
    });
    const delCount = firstNode.getTextContent().length - startOffset;
    const lastNode = selectedNodes[selectedNodes.length - 1];
    if (lastNode.isText()) {
      text += lastNode.getTextContent().slice(endOffset);
    }
    spliceTextAtCusor(
      firstNode,
      startOffset,
      delCount,
      text,
      fromComposition,
      viewModel,
      state
    );
  }
}

export function insertText(text, viewModel, state, fromComposition) {
  const selection = viewModel.getSelection();

  // selection.insertText(text, {
  //   bold: state.isBoldMode,
  //   italic: state.isItalicMode,
  //   underline: state.isUnderlineMode,
  //   strikeThrough: state.isStrikeThroughMode,
  //   fromComposition,
  // });
  // return;
  const selectedNodes = selection.getNodes();

  if (selection.isCaret()) {
    const caretOffset = selection.getCaretOffset();
    spliceTextAtCusor(
      selectedNodes[0],
      caretOffset,
      0,
      text,
      fromComposition,
      viewModel,
      state
    );
  } else {
    const [startOffset, offsetDifference] = normalizeCursorSelectionOffsets(
      selection
    );
    // We're selecting a single node treat it like a cursor
    if (selectedNodes.length === 1) {
      const firstNode = selectedNodes[0];
      spliceTextAtCusor(
        firstNode,
        startOffset,
        offsetDifference,
        text,
        fromComposition,
        viewModel,
        state
      );
      if (firstNode.isImmutable()) {
        const ancestor = getParentBeforeBlock(firstNode);
        ancestor.remove();
      }
    } else {
      spliceTextAtRange(
        text,
        selection,
        selectedNodes,
        fromComposition,
        viewModel,
        state
      );
    }
  }
}

function removeBlock(blockToRemove, previousBlock, viewModel) {
  const firstNode = blockToRemove.getFirstChild();
  const siblings = getNextSiblings(firstNode);
  siblings.unshift(firstNode);
  const textNode = viewModel.createText("");
  previousBlock.getLastChild().insertAfter(textNode);
  textNode.select(0, 0);
  let nodeToInsertAfter = textNode;
  siblings.forEach((sibling) => {
    nodeToInsertAfter.insertAfter(sibling);
    nodeToInsertAfter = sibling;
  });
  blockToRemove.remove();
  previousBlock.normalizeTextNodes(true);
}

export function removeText(backward, viewModel, state) {
  const selection = viewModel.getSelection();
  const selectedNodes = selection.getNodes();

  if (selection.isCaret()) {
    const firstNode = selectedNodes[0];
    const caretOffset = selection.getCaretOffset();
    const currentBlock = getParentBlock(firstNode);
    const previousBlock = currentBlock.getPreviousSibling();
    const nextBlock = currentBlock.getNextSibling();
    const ancestor = getParentBeforeBlock(firstNode);

    if (firstNode.isImmutable()) {
      if (caretOffset === 0 && previousBlock !== null) {
        removeBlock(currentBlock, previousBlock, viewModel);
      } else {
        const textNode = viewModel.createText("");
        ancestor.insertBefore(textNode);
        textNode.select();
        ancestor.remove();
        currentBlock.normalizeTextNodes(true);
      }
    } else {
      if (caretOffset > 0) {
        const offsetAtEnd =
          firstNode.isText() &&
          caretOffset === firstNode.getTextContent().length;
        if (backward || !offsetAtEnd) {
          const offset = backward ? caretOffset - 1 : caretOffset;
          spliceTextAtCusor(firstNode, offset, 1, "", false, viewModel, state);
        } else {
          const nextSibling = firstNode.getNextSibling();
          if (nextSibling === null) {
            if (nextBlock !== null) {
              removeBlock(nextBlock, currentBlock, viewModel);
            }
          } else {
            const textNode = viewModel.createText("");
            nextSibling.insertAfter(textNode);
            textNode.select();
            if (nextSibling.isImmutable()) {
              nextSibling.remove();
            }
            currentBlock.normalizeTextNodes(true);
          }
        }
      } else if (backward) {
        const prevSibling = firstNode.getPreviousSibling();
        if (prevSibling === null) {
          if (previousBlock !== null) {
            removeBlock(currentBlock, previousBlock, viewModel);
          }
        } else {
          const textNode = viewModel.createText("");
          prevSibling.insertAfter(textNode);
          textNode.select();
          if (prevSibling.isImmutable()) {
            prevSibling.remove();
          }
          currentBlock.normalizeTextNodes(true);
        }
      } else {
        spliceTextAtCusor(
          firstNode,
          caretOffset,
          1,
          "",
          false,
          viewModel,
          state
        );
      }
    }
  } else {
    const [startOffset, offsetDifference] = normalizeCursorSelectionOffsets(
      selection
    );
    // We're selecting a single node treat it like a cursor
    if (selectedNodes.length === 1) {
      const firstNode = selectedNodes[0];
      if (firstNode.isImmutable()) {
        const ancestor = getParentBeforeBlock(firstNode);
        const textNode = viewModel.createText("");
        ancestor.insertBefore(textNode);
        textNode.select();
        ancestor.remove();
      } else {
        spliceTextAtCusor(
          firstNode,
          startOffset,
          offsetDifference,
          "",
          false,
          viewModel,
          state
        );
      }
    } else {
      spliceTextAtRange("", selection, selectedNodes, false, viewModel, state);
    }
  }
}

export function onCompositionStart(event, viewModel, state) {
  state.isComposing = true;
}

export function onCompositionEnd(event, viewModel, state) {
  const data = event.data;
  // Only do this for Chrome
  state.isComposing = false;
  if (data && !isBrowserSafari && !isBrowserFirefox) {
    insertText(data, viewModel, state, true);
  }
}

export function onInsertFromPaste(event, viewModel, state, editor) {
  const items = event.dataTransfer.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "string" && item.type === "text/plain") {
      item.getAsString((text) => {
        const viewModel = editor.createViewModel((viewModel) => {
          insertText(text, viewModel, state, false);
        });
        editor.update(viewModel);
      });
      break;
    }
  }
}

export function onFocusIn(event, viewModel) {
  const body = viewModel.getBody();

  if (body.getFirstChild() === null) {
    const text = viewModel.createText();
    body.append(viewModel.createBlock().append(text));
    text.select();
  }
}

export function onKeyDown() {
  // TODO
}

export function onSelectionChange(event, helpers) {
  // TODO
}

export function useEvent(outlineEditor, eventName, handler, pluginStateRef) {
  useEffect(() => {
    const state = pluginStateRef.current;
    if (state !== null && outlineEditor !== null) {
      const target =
        eventName === "selectionchange"
          ? document
          : outlineEditor.getEditorElement();
      const wrapper = (event) => {
        const viewModel = outlineEditor.createViewModel((editor) =>
          handler(event, editor, state, outlineEditor)
        );
        outlineEditor.update(viewModel);
      };
      target.addEventListener(eventName, wrapper);
      return () => {
        target.removeEventListener(eventName, wrapper);
      };
    }
  }, [eventName, handler, outlineEditor, pluginStateRef]);
}
