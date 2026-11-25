// Two apps behind one address: the public anketa form (small, opened by clients on phones) and the staff app.
// Each is loaded only when its address is opened, so the form doesn't wait for the staff app's script.
import './index.css'

const entry = location.pathname.startsWith('/anketa/') ? import('./anketaMain') : import('./appMain')
void entry.then((m) => m.mount())
