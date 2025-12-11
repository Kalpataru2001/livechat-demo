class EmojiPicker extends HTMLElement {
  constructor() {
    super();
    const emojis = [
      "😀","😁","😂","🤣","😊","😍","😘","😗",
      "😜","🤗","🤭","🤫","🤔","🥺","❤️","💋",
      "💕","💞","💘","💝","💖","💗","💓","💟",
      "❣️","😍","🥰","😘"
    ];

    this.innerHTML = `
      <div style="padding:10px; display:flex; flex-wrap:wrap; gap:8px; font-size:26px;">
        ${emojis.map(e => `<span class="emoji">${e}</span>`).join("")}
      </div>
    `;
  }

  connectedCallback() {
    this.querySelectorAll(".emoji").forEach(el => {
      el.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("emoji-click", {
          detail: { emoji: el.textContent }
        }));
      });
    });
  }
}
customElements.define("emoji-picker", EmojiPicker);
