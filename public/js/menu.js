// Mobile menu. Without this script the navigation is simply always visible.
(function () {
  var button = document.querySelector('.menu-button');
  var nav = document.getElementById('site-nav');
  if (!button || !nav) return;
  document.documentElement.classList.add('js');
  button.hidden = false;
  button.addEventListener('click', function () {
    var open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      button.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
      button.focus();
    }
  });
})();
