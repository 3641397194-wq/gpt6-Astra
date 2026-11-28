// SPDX-License-Identifier: GPL-3.0-only
// Android can retain an older system WebView even on a supported OS version.
// esbuild lowers JavaScript syntax, but does not supply missing browser APIs.
if (typeof Element.prototype.replaceChildren !== 'function') {
  Object.defineProperty(Element.prototype, 'replaceChildren', {
    configurable: true, writable: true,
    value(...children) {
      const fragment = this.ownerDocument.createDocumentFragment();
      for (const child of children) fragment.append(child);
      while (this.firstChild) this.removeChild(this.firstChild);
      this.appendChild(fragment);
    },
  });
}

if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true, writable: true,
    value(index) {
      const position = Math.trunc(Number(index)) || 0;
      const offset = position < 0 ? this.length + position : position;
      return offset >= 0 && offset < this.length ? this[offset] : undefined;
    },
  });
}

if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true, writable: true,
    value(object, property) { return Object.prototype.hasOwnProperty.call(object, property); },
  });
}

if (typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(Object.getPrototypeOf(crypto), 'randomUUID', {
    configurable: true, writable: true,
    value() {
      const bytes = this.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return Array.from(bytes, (byte, index) =>
        ([4, 6, 8, 10].includes(index) ? '-' : '') + ('0' + byte.toString(16)).slice(-2)).join('');
    },
  });
}
