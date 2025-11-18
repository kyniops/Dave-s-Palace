// Davecoin module: per-account balance with global header display
(function(){
  const USER_KEY = 'utilisateurCourant';
  const PREFIX = 'davecoin_';

  function getCurrentUser(){
    return localStorage.getItem(USER_KEY) || 'guest';
  }

  function storageKey(){
    return PREFIX + getCurrentUser();
  }

  function ensureInitialized(){
    const key = storageKey();
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, '1000');
    }
  }

  function get(){
    ensureInitialized();
    const val = parseInt(localStorage.getItem(storageKey()), 10);
    return isNaN(val) ? 0 : val;
  }

  function set(v){
    const val = Math.max(0, Math.floor(v));
    localStorage.setItem(storageKey(), String(val));
    updateHeader();
    return val;
  }

  function add(delta){
    return set(get() + Number(delta || 0));
  }

  function updateHeader(){
    let header = document.querySelector('.davecoin-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'davecoin-header';
      header.innerHTML = '<span class="dc-amount"></span><span class="dc-label"> Davecoins</span>';
      document.body.appendChild(header);
    }
    const amountEl = header.querySelector('.dc-amount');
    if (amountEl) {
      amountEl.textContent = String(get());
    }
  }

  window.Davecoin = {
    get,
    set,
    add,
    ensureInitialized,
    updateHeader,
    currentUser: getCurrentUser,
    key: storageKey
  };

  document.addEventListener('DOMContentLoaded', function(){
    ensureInitialized();
    updateHeader();
  });
})();