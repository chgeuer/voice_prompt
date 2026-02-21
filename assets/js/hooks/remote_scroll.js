const RemoteScroll = {
  mounted() {
    this.scrollCurrent = 0;
    this.scrollTarget = 0;
    this.startSmoothScroll();
    this.scrollToCurrentWord();
  },

  updated() {
    this.scrollToCurrentWord();
  },

  startSmoothScroll() {
    const tick = () => {
      const diff = this.scrollTarget - this.scrollCurrent;
      if (Math.abs(diff) > 0.5) {
        this.scrollCurrent += diff * 0.1;
        const scroller = document.getElementById('remoteScriptScroll');
        if (scroller) scroller.scrollTop = this.scrollCurrent;
      } else {
        this.scrollCurrent = this.scrollTarget;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  scrollToCurrentWord() {
    const scroller = document.getElementById('remoteScriptScroll');
    const text = document.getElementById('remoteScriptText');
    if (!scroller || !text) return;

    const words = text.querySelectorAll('.word');
    let currentWord = null;
    let maxOpacity = 0;
    words.forEach(w => {
      const op = parseFloat(w.style.opacity);
      if (op > maxOpacity) {
        maxOpacity = op;
        currentWord = w;
      }
    });
    if (!currentWord) return;

    const spanTop = currentWord.offsetTop - text.offsetTop;
    const targetScroll = spanTop - (scroller.clientHeight * 0.35);
    this.scrollCurrent = scroller.scrollTop;
    this.scrollTarget = Math.max(0, targetScroll);
  }
};

export default RemoteScroll;
