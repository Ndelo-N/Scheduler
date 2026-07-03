'use strict';
/**
 * authGate.js — the login gate for the PWA (client side of bricks 3–5).
 *
 * Flow: on boot, ask the server who we are (GET /api/auth/me via APIClient).
 *   - not authenticated        → show the login screen
 *   - authenticated + must-change → show the change-password screen
 *   - authenticated + ok        → hand control to the app (onReady)
 *
 * It also listens for the events api.js fires on mid-session failures
 * ('auth:unauthenticated', 'auth:password-change-required') and re-shows the
 * right screen. All DOM is built with createElement + textContent (no innerHTML
 * with user/attacker data).
 */

// Pure, unit-testable boot decision.
function decideAuthState(session) {
  if (!session || !session.user) return 'login';
  if (session.mustChangePassword) return 'change-password';
  return 'ready';
}

class AuthGate {
  /** @param {{api, mountEl:HTMLElement, appEl?:HTMLElement, onReady?:(user)=>void}} opts */
  constructor({ api, mountEl, appEl, onReady }) {
    this.api = api;
    this.mountEl = mountEl;   // overlay container for the login / change screens
    this.appEl = appEl;       // the app container (hidden until authenticated)
    this.onReady = onReady;
    this.currentUser = null;

    window.addEventListener('auth:unauthenticated', () => this.showLogin());
    window.addEventListener('auth:password-change-required', () => this.showChangePassword());
  }

  async boot() {
    let session = null;
    try { session = await this.api.getSession(); } catch { /* offline etc. → treat as login */ }
    this._route(decideAuthState(session), session);
  }

  _route(state, session) {
    if (state === 'ready') return this._enterApp(session.user);
    if (state === 'change-password') return this.showChangePassword();
    return this.showLogin();
  }

  _enterApp(user) {
    this.currentUser = user;
    this.mountEl.hidden = true;
    this.mountEl.textContent = '';
    if (this.appEl) this.appEl.hidden = false;
    if (typeof this.onReady === 'function') this.onReady(user);
  }

  _showOverlay() {
    if (this.appEl) this.appEl.hidden = true;
    this.mountEl.hidden = false;
  }

  showLogin() {
    this._showOverlay();
    const { fields, error, submit } = this._panel('Sign in', [
      { name: 'uNumber', label: 'u-Number', type: 'text', autocomplete: 'username' },
      { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' }
    ], 'Sign in');

    submit.addEventListener('click', async () => {
      error.textContent = '';
      submit.disabled = true;
      try {
        const res = await this.api.login(fields.uNumber.value.trim(), fields.password.value);
        if (res && res.mustChangePassword) return this.showChangePassword();
        const session = await this.api.getSession(); // full user + fresh state
        this._route(decideAuthState(session), session);
      } catch (e) {
        error.textContent = (e && e.body && e.body.error) || 'Sign in failed';
        submit.disabled = false;
      }
    });
  }

  showChangePassword() {
    this._showOverlay();
    const { fields, error, submit } = this._panel('Set a new password', [
      { name: 'current', label: 'Current password', type: 'password', autocomplete: 'current-password' },
      { name: 'next', label: 'New password', type: 'password', autocomplete: 'new-password' },
      { name: 'confirm', label: 'Confirm new password', type: 'password', autocomplete: 'new-password' }
    ], 'Update password');

    submit.addEventListener('click', async () => {
      error.textContent = '';
      if (fields.next.value !== fields.confirm.value) {
        error.textContent = 'New passwords do not match';
        return;
      }
      submit.disabled = true;
      try {
        await this.api.changePassword(fields.current.value, fields.next.value);
        const session = await this.api.getSession();
        this._route(decideAuthState(session), session);
      } catch (e) {
        error.textContent = (e && e.body && e.body.error) || 'Could not update password';
        submit.disabled = false;
      }
    });
  }

  async logout() {
    await this.api.logout();
    this.currentUser = null;
    this.showLogin();
  }

  // Build an XSS-safe form panel; returns { fields, error, submit }.
  _panel(title, fieldDefs, submitLabel) {
    this.mountEl.textContent = '';
    const panel = document.createElement('div');
    panel.className = 'auth-panel';

    const heading = document.createElement('h2');
    heading.textContent = title;
    panel.appendChild(heading);

    const fields = {};
    for (const def of fieldDefs) {
      const label = document.createElement('label');
      label.textContent = def.label;
      const input = document.createElement('input');
      input.type = def.type;
      input.name = def.name;
      if (def.autocomplete) input.autocomplete = def.autocomplete;
      label.appendChild(input);
      panel.appendChild(label);
      fields[def.name] = input;
    }

    const error = document.createElement('p');
    error.className = 'auth-error';
    error.setAttribute('role', 'alert');

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.textContent = submitLabel;

    panel.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });
    panel.appendChild(error);
    panel.appendChild(submit);
    this.mountEl.appendChild(panel);

    const firstDef = fieldDefs[0];
    if (firstDef && fields[firstDef.name]) fields[firstDef.name].focus();
    return { fields, error, submit };
  }
}

if (typeof window !== 'undefined') {
  window.AuthGate = AuthGate;
  window.decideAuthState = decideAuthState;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AuthGate, decideAuthState };
}
