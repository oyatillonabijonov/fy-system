// Two apps behind one address: the public anketa form (small, opened by clients on phones) and the staff app.
// Each is loaded only when its address is opened, so the form doesn't wait for the staff app's script.
import './index.css'
import { configMissing } from './lib/config'

if (configMissing.length) {
  // An install without its required settings: say what is missing instead of a blank page. No app code is loaded.
  document.title = "Tizim sozlanmagan"
  document.getElementById('root')!.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center p-6 bg-surface-sunken">
      <div role="alert" class="w-full max-w-[440px] bg-surface border border-line rounded-overlay p-8 flex flex-col gap-3">
        <h1 class="text-lg font-semibold text-ink">Tizim sozlanmagan</h1>
        <p class="text-base text-ink-muted">O'rnatish tugallanmagan. Quyidagi sozlamalar berilmagan:</p>
        <ul class="flex flex-col gap-1 text-base text-ink font-mono">${configMissing.map((k) => `<li>${k}</li>`).join("")}</ul>
        <p class="text-sm text-ink-faint">Ularni konteyner muhitiga (env) qo'shib, konteynerni qayta ishga tushiring.</p>
      </div>
    </div>`
} else {
  const entry = location.pathname.startsWith('/anketa/') ? import('./anketaMain') : import('./appMain')
  void entry.then((m) => m.mount())
}
