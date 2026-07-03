# Brick 7 — TLS + LAN Access Runbook (scheduler.local)

The code (HTTPS wiring, scoped static, security headers) is done and verified. This
runbook is the part that runs on **your hardware** — naming, DNS, and the mkcert
certificate + trust. Do it once on the lab machine and once per client device.

Prereqs: the lab machine has a **static LAN IP** (set a DHCP reservation on the
router). Below assumes `192.168.1.50` — substitute yours.

---

## 1. Rename the machine (drop the university domain)

Set the hostname to `scheduler` (no `up.ac.za` suffix).

```bash
sudo hostnamectl set-hostname scheduler        # Linux
# Windows: Settings → System → About → Rename this PC → "scheduler"
```

## 2. Make `scheduler.local` resolve on the LAN (no public DNS)

**Option A — mDNS (recommended, zero client config).** Install an mDNS responder;
Windows 10+/macOS/iOS resolve `.local` natively, Linux needs Avahi.

```bash
sudo apt install avahi-daemon      # Debian/Ubuntu lab host
sudo systemctl enable --now avahi-daemon
```
`scheduler.local` now resolves to the host on the LAN. `.local` is reserved for
mDNS and never leaves the network.

**Option B — if mDNS is blocked.** Add one record on the router/local DNS
(dnsmasq/Pi-hole): `192.168.1.50  scheduler.local`, or a hosts entry on each
client (`/etc/hosts`, or `C:\Windows\System32\drivers\etc\hosts`):
```
192.168.1.50    scheduler.local
```

## 3. Issue the certificate with mkcert (local CA)

On the lab machine:

```bash
# install mkcert (Linux example)
sudo apt install libnss3-tools
curl -L https://dl.filippo.io/mkcert/latest?for=linux/amd64 -o mkcert && chmod +x mkcert && sudo mv mkcert /usr/local/bin/

mkcert -install                                  # create + trust a LOCAL root CA on this host
mkdir -p ./certs
mkcert -key-file ./certs/scheduler.local-key.pem \
       -cert-file ./certs/scheduler.local.pem \
       scheduler.local 192.168.1.50              # name + IP as SANs

mkcert -CAROOT                                    # prints the folder containing rootCA.pem
```

## 4. Trust the root CA on each client device (one-time)

Copy `rootCA.pem` (from `mkcert -CAROOT`) to each device and trust it:
- **Windows:** `certutil -addstore -f "ROOT" rootCA.pem` (admin), or import into "Trusted Root Certification Authorities".
- **macOS:** Keychain Access → System → drag in → set to "Always Trust".
- **iOS:** AirDrop/email the file → Settings → Profile Downloaded → install → Settings → General → About → Certificate Trust Settings → enable.
- **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
- **Linux/Firefox:** import into the OS trust store or Firefox's own certificate store.

This one-time trust is what makes the green padlock work — and it's required for
the service worker to register (browsers refuse a SW over a cert error).

## 5. Run the server over HTTPS

Point the server at the cert and the PWA directory, then start:

```bash
# .env (or shell env) on the lab machine
export TLS_KEY=./certs/scheduler.local-key.pem
export TLS_CERT=./certs/scheduler.local.pem
export PWA_DIR=./public          # a scoped dir — copy the built PWA assets here; NOT the repo root
export PORT=443                  # or 8443 if you don't want to bind the privileged port
export DB_HOST=localhost DB_NAME=shift_scheduler DB_USER=postgres DB_PASSWORD=…

node setup.js migrate            # schema.sql + additive migrations
node server/index.js             # logs "HTTPS" when the cert is found
```

Students visit **https://scheduler.local** (or `:8443`). The PWA and API are the
same origin, so the session cookie and offline SW both work with no CORS.

> Put only the PWA's client assets in `PWA_DIR`. `server/`, `database/`, `.env`,
> and `node_modules` must stay **outside** it — the scoped static server is what
> keeps them off the web, but don't undermine it by pointing `PWA_DIR` at the root.

## 6. Verify

```bash
curl -kI https://scheduler.local/                 # 200, security headers, HSTS present
curl -k  https://scheduler.local/.env             # must NOT return .env contents
curl -k  https://scheduler.local/api/auth/me      # 401 JSON when not logged in
```
From a trusted client device, `https://scheduler.local` should show a valid
padlock (no warning) and register the service worker.

---

## Notes / cautions

- **HSTS** is sent only over HTTPS (max-age 180 days). Once clients receive it they
  will refuse plain HTTP to `scheduler.local` — intended, but keep TLS stable
  before relying on it. To back out during testing, lower/remove HSTS in
  `server/middleware/securityHeaders.js`.
- **CSP** currently allows `'unsafe-inline'` scripts so the existing `index.html`
  works. Harden by externalizing inline scripts, then remove `'unsafe-inline'`
  from `script-src` (marked TODO in `securityHeaders.js`).
- **LAN-only:** if the host has a public interface, bind the server/firewall to the
  LAN interface so it isn't internet-reachable.
- Cert lifetime: mkcert certs are long-lived; regenerate with the same command
  before expiry and redeploy (no client CA re-trust needed).
