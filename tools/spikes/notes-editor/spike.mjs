import { normalizeSafePreviewHref, SAFE_PREVIEW_ELEMENTS } from "./preview-policy.mjs";
import { resolveOverTypeBrowserExports } from "./overtype-adapter.mjs";

const INITIAL_DRAFT = `Welcome to the workshop.

Literal Markdown-like characters remain readable: \\*asterisk\\*, # hash, and [brackets].

- First discussion point
- Second discussion point`;

const { OverTypeEditor, toolbarButtons } = resolveOverTypeBrowserExports(window);

const elements = {
  dialog: document.querySelector("#editor-dialog"),
  host: document.querySelector("#editor-host"),
  callerDraft: document.querySelector("#caller-draft"),
  callerPreview: document.querySelector("#caller-preview"),
  localSource: document.querySelector("#local-source"),
  status: document.querySelector("#status"),
  open: document.querySelector("#open-editor"),
  close: document.querySelector("#close-editor"),
  cancel: document.querySelector("#cancel-editor"),
  apply: document.querySelector("#apply-editor"),
  theme: document.querySelector("#theme")
};

let callerDraft = INITIAL_DRAFT;
let editBuffer = "";
let editor = null;
let opener = null;
let createdInstances = 0;
let destroyedInstances = 0;

function setStatus(message) {
  elements.status.value = message;
  elements.status.textContent = message;
}

function sanitizePreviewHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  [...template.content.querySelectorAll("*")].reverse().forEach((node) => {
    if (!SAFE_PREVIEW_ELEMENTS.has(node.tagName)) node.replaceWith(...node.childNodes);
  });
  template.content.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (node.tagName !== "A" || attribute.name.toLowerCase() !== "href") node.removeAttribute(attribute.name);
    }
    if (node instanceof HTMLAnchorElement) {
      const rawHref = node.getAttribute("href") ?? "";
      const safeHref = normalizeSafePreviewHref(rawHref);
      if (safeHref === null) node.removeAttribute("href");
      else node.setAttribute("href", safeHref);
    }
  });
  return template.content;
}

function renderMarkdown(markdown, target) {
  const scratch = document.createElement("div");
  const [renderer] = new OverTypeEditor(scratch, {
    value: markdown,
    toolbar: false,
    linkPaste: false,
    spellcheck: false,
    theme: elements.theme.value
  });
  createdInstances += 1;
  const html = renderer.getCleanHTML();
  renderer.destroy();
  destroyedInstances += 1;
  target.replaceChildren(sanitizePreviewHtml(html));
}

function refreshCallerView() {
  elements.callerDraft.textContent = callerDraft;
  renderMarkdown(callerDraft, elements.callerPreview);
}

function destroyEditor() {
  if (!editor) return;
  editor.destroy();
  destroyedInstances += 1;
  editor = null;
  elements.host.replaceChildren();
}

function finishClose(message) {
  destroyEditor();
  elements.dialog.close();
  setStatus(message);
  opener?.focus();
  opener = null;
}

function openEditor() {
  if (elements.dialog.open) return false;
  destroyEditor();
  opener = document.activeElement;
  editBuffer = callerDraft;
  elements.localSource.textContent = editBuffer;
  elements.dialog.showModal();
  try {
    [editor] = new OverTypeEditor(elements.host, {
      value: editBuffer,
      toolbar: true,
      toolbarButtons: [toolbarButtons.bold, toolbarButtons.italic, toolbarButtons.bulletList, toolbarButtons.orderedList],
      linkPaste: false,
      spellcheck: true,
      theme: elements.theme.value,
      onChange(value) {
        editBuffer = value;
        elements.localSource.textContent = value;
      }
    });
  } catch (error) {
    elements.dialog.close();
    opener = null;
    throw error;
  }
  createdInstances += 1;
  editor.textarea.focus();
  setStatus("Lokaler Bearbeitungspuffer geöffnet.");
  return true;
}

function applyEditor() {
  if (!editor) return false;
  editBuffer = editor.getValue();
  callerDraft = editBuffer;
  finishClose("Änderungen wurden in den Caller-Draft übernommen.");
  refreshCallerView();
  return true;
}

function cancelEditor() {
  if (!editor) return false;
  finishClose("Lokale Änderungen wurden verworfen; der Caller-Draft blieb unverändert.");
  return true;
}

function requestClose() {
  if (!editor) return true;
  editBuffer = editor.getValue();
  if (editBuffer !== callerDraft && !window.confirm("Nicht übernommene Änderungen verwerfen?")) return false;
  finishClose("Editor geschlossen; der Caller-Draft blieb unverändert.");
  return true;
}

function setTheme(theme) {
  if (!['solar', 'cave'].includes(theme)) return false;
  elements.theme.value = theme;
  document.documentElement.dataset.theme = theme;
  editor?.setTheme(theme);
  refreshCallerView();
  return true;
}

elements.open.addEventListener("click", openEditor);
elements.apply.addEventListener("click", applyEditor);
elements.cancel.addEventListener("click", cancelEditor);
elements.close.addEventListener("click", requestClose);
elements.theme.addEventListener("change", () => setTheme(elements.theme.value));
elements.dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestClose();
});

document.documentElement.dataset.theme = elements.theme.value;
refreshCallerView();

window.notesEditorSpike = Object.freeze({
  open: openEditor,
  apply: applyEditor,
  cancel: cancelEditor,
  requestClose,
  setTheme,
  setEditorValue(value) {
    if (!editor || typeof value !== "string") return false;
    editor.setValue(value);
    editBuffer = value;
    elements.localSource.textContent = value;
    return true;
  },
  state() {
    return {
      callerDraft,
      editBuffer: editor?.getValue() ?? null,
      open: elements.dialog.open,
      createdInstances,
      destroyedInstances,
      toolbarActions: [...elements.host.querySelectorAll("button")].map((button) => button.title || button.getAttribute("aria-label") || button.textContent.trim()),
      previewHtml: elements.callerPreview.innerHTML
    };
  }
});

window.dispatchEvent(new Event("notes-editor-spike-ready"));
