const likesPanel = document.querySelector('#likesPanel');
const toggleButtons = [
  document.querySelector('#toggleLikesSecondary')
].filter(Boolean);

function setLikes(open) {
  likesPanel.hidden = !open;
  toggleButtons.forEach((button) => {
    button.setAttribute('aria-expanded', String(open));
  });
  if (toggleButtons[0]) {
    toggleButtons[0].textContent = open ? '취향 접기' : '취향 펼쳐보기';
  }
  if (toggleButtons[1]) {
    toggleButtons[1].textContent = open ? '취향 접기' : '취향을 조금 더 보기';
  }
}

toggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    setLikes(open);
  });
});


// index.html에서 이동한 상호작용 스크립트 1
(() => {
      const dialog = document.getElementById('photoLightbox');
      const lightboxImage = document.getElementById('lightboxImage');
      const closeButton = dialog?.querySelector('.lightbox-close');
      const triggers = document.querySelectorAll('.photo-lightbox-trigger');

      if (!dialog || !lightboxImage || !closeButton || !triggers.length) return;

      let lastTrigger = null;

      const openLightbox = (trigger) => {
        lastTrigger = trigger;
        lightboxImage.src = trigger.dataset.full;
        lightboxImage.alt = trigger.dataset.alt || '';
        dialog.showModal();
        closeButton.focus();
      };

      const closeLightbox = () => {
        dialog.close();
      };

      triggers.forEach((trigger) => {
        trigger.addEventListener('click', () => openLightbox(trigger));
      });

      closeButton.addEventListener('click', closeLightbox);

      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeLightbox();
      });

      dialog.addEventListener('close', () => {
        lightboxImage.src = '';
        if (lastTrigger) lastTrigger.focus();
      });
    })();
