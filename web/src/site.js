// Čekací listina a přepínač jazyka. Bez knihoven, funguje i bez serveru (náhled webu).
(function () {
  var cfg = window.YESYES_SITE || {};
  var t = cfg.t || {};

  // Jazyk: výběr ze seznamu vede na stránku v daném jazyce a zapamatuje se.
  var select = document.getElementById('lang-select');
  if (select) {
    select.addEventListener('change', function () {
      try {
        localStorage.setItem('yesyes.lang', select.value);
      } catch (e) {}
      var option = select.options[select.selectedIndex];
      if (option && option.dataset.href) window.location.href = option.dataset.href;
    });
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  document.querySelectorAll('form.waitlist').forEach(function (form) {
    var msg = form.querySelector('.form-msg');
    var button = form.querySelector('button[type="submit"]');
    function say(text, kind) {
      msg.textContent = text;
      msg.className = 'form-msg ' + (kind || '');
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = form.querySelector('input[type="email"]').value.trim();
      var consent = form.querySelector('input[type="checkbox"]');
      var city = form.querySelector('select');
      if (!validEmail(email)) return say(t.errorEmail, 'err');
      if (consent && !consent.checked) return say(t.errorConsent, 'err');
      button.disabled = true;
      var label = button.textContent;
      button.textContent = t.sending;
      var body = { email: email, city: city ? city.value : '', locale: cfg.locale, consent: true };
      var done = function () {
        button.disabled = false;
        button.textContent = label;
      };
      if (!cfg.apiUrl) {
        // Náhled bez serveru: jen ukážeme, co uvidí návštěvník.
        setTimeout(function () {
          done();
          form.reset();
          say(t.success, 'ok');
        }, 600);
        return;
      }
      fetch(cfg.apiUrl.replace(/\/$/, '') + '/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': cfg.locale },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          done();
          if (res.ok) {
            form.reset();
            say(t.success, 'ok');
          } else if (res.status === 400) {
            say(t.errorEmail, 'err');
          } else {
            say(t.errorServer, 'err');
          }
        })
        .catch(function () {
          done();
          say(t.errorServer, 'err');
        });
    });
  });
})();
