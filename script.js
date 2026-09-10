const toggleButton = document.querySelector('#toggleLikes');
const likesPanel = document.querySelector('#likesPanel');

toggleButton.addEventListener('click', () => {
  const isOpen = toggleButton.getAttribute('aria-expanded') === 'true';
  toggleButton.setAttribute('aria-expanded', String(!isOpen));
  likesPanel.hidden = isOpen;
  toggleButton.textContent = isOpen ? '좋아하는 것 보기' : '좋아하는 것 접기';
});
