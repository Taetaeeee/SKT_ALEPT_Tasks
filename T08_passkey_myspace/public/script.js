const likesPanel = document.querySelector('#likesPanel');
const toggleButtons = [
  document.querySelector('#toggleLikes'),
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
