// Frontend de Trionix Gear: HTML/CSS/JS puro, consume la API con fetch sin recargar.
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const TOKEN_KEY = 'trionix_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let usuariosActivos = [];

// Escapa texto antes de meterlo en innerHTML (evita inyección de HTML)
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Mensajes ---------- */
let toastTimer;
function mostrarMensaje(texto, tipo = 'error') {
  const box = $('#toast');
  box.textContent = texto;
  box.className = `toast ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add('oculto'), 5000);
}

/* ---------- Cliente de la API ---------- */
async function api(ruta, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${ruta}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }

  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }

  if (!res.ok) {
    if (res.status === 401 && token) {
      cerrarSesion();
      throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    }
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return data;
}

// Ejecuta una acción y muestra el error legible (400/404/409...) si falla
async function intentar(fn) {
  try { return await fn(); } catch (err) { mostrarMensaje(err.message, 'error'); }
}

/* ---------- Sesión ---------- */
function actualizarSesion() {
  document.body.classList.toggle('autenticado', Boolean(token));
  const b = $('#estado-sesion');
  b.textContent = token ? 'Administrador' : 'Solo lectura';
  b.className = `badge ${token ? 'ok' : 'gris'}`;
}

function cerrarSesion() {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
  actualizarSesion();
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  intentar(async () => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { username: $('#login-usuario').value, password: $('#login-password').value },
    });
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    e.target.reset();
    actualizarSesion();
    mostrarMensaje('Sesión iniciada', 'ok');
    refrescarTodo();
  });
});

$('#btn-logout').addEventListener('click', () => {
  cerrarSesion();
  mostrarMensaje('Sesión cerrada', 'ok');
});

/* ---------- Pestañas ---------- */
document.querySelectorAll('.tab-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('activa', b === btn));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activa', t.id === `tab-${btn.dataset.tab}`));
    cargarVista(btn.dataset.tab);
  })
);

function cargarVista(nombre) {
  if (nombre === 'inventario') return cargarEquipos();
  if (nombre === 'usuarios') return cargarUsuarios();
  if (nombre === 'prestamos') { cargarSelectsPrestamo(); return cargarPrestamos(); }
  if (nombre === 'resumen') return cargarResumen();
}

function refrescarTodo() {
  cargarEquipos();
  cargarUsuarios();
  cargarSelectsPrestamo();
  cargarPrestamos();
  cargarResumen();
}

/* ---------- Utilidades ---------- */
const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString('es-CO') : '—');
const filaVacia = (cols, txt) => `<tr><td class="vacio" colspan="${cols}">${txt}</td></tr>`;
const claseEstadoEquipo = { disponible: 'ok', prestado: 'warn', mantenimiento: 'danger' };

/* ---------- Inventario ---------- */
async function cargarEquipos() {
  await intentar(async () => {
    const q = new URLSearchParams();
    if ($('#filtro-eq-categoria').value) q.set('categoria', $('#filtro-eq-categoria').value);
    if ($('#filtro-eq-estado').value) q.set('estado', $('#filtro-eq-estado').value);
    const equipos = await api(`/equipos${q.size ? `?${q}` : ''}`);

    $('#tabla-equipos tbody').innerHTML =
      equipos.map((e) => `
        <tr>
          <td><b>${esc(e.codigo)}</b></td>
          <td>${esc(e.nombre)}</td>
          <td>${esc(e.categoria)}</td>
          <td><span class="badge ${claseEstadoEquipo[e.estado] || 'gris'}">${esc(e.estado)}</span></td>
          <td>${esc(e.ubicacion)}</td>
          <td class="solo-admin">
            ${e.estado === 'disponible' ? `<button class="btn btn-sec btn-chico" data-accion="eq-estado" data-id="${e._id}" data-estado="mantenimiento">Mantenimiento</button>` : ''}
            ${e.estado === 'mantenimiento' ? `<button class="btn btn-sec btn-chico" data-accion="eq-estado" data-id="${e._id}" data-estado="disponible">Habilitar</button>` : ''}
            <button class="btn btn-peligro btn-chico" data-accion="eq-eliminar" data-id="${e._id}">Eliminar</button>
          </td>
        </tr>`).join('') || filaVacia(6, 'No hay equipos con esos filtros');
  });
}

$('#filtro-eq-categoria').addEventListener('change', cargarEquipos);
$('#filtro-eq-estado').addEventListener('change', cargarEquipos);

$('#equipo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  intentar(async () => {
    const body = {
      codigo: $('#eq-codigo').value,
      nombre: $('#eq-nombre').value,
      categoria: $('#eq-categoria').value,
    };
    const ubicacion = $('#eq-ubicacion').value.trim();
    if (ubicacion) body.ubicacion = ubicacion;
    await api('/equipos', { method: 'POST', body });
    e.target.reset();
    mostrarMensaje('Equipo creado', 'ok');
    cargarEquipos();
    cargarSelectsPrestamo();
    cargarResumen();
  });
});

/* ---------- Usuarios ---------- */
async function cargarUsuarios() {
  await intentar(async () => {
    const usuarios = await api('/usuarios');
    $('#tabla-usuarios tbody').innerHTML =
      usuarios.map((u) => `
        <tr>
          <td>${esc(u.nombre)}</td>
          <td>${esc(u.documento)}</td>
          <td>${esc(u.email)}</td>
          <td>${esc(u.tipo)}</td>
          <td><span class="badge ${u.activo ? 'ok' : 'gris'}">${u.activo ? 'Sí' : 'No'}</span></td>
          <td class="solo-admin">
            <button class="btn btn-sec btn-chico" data-accion="usr-activo" data-id="${u._id}" data-activo="${u.activo ? 'false' : 'true'}">${u.activo ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-peligro btn-chico" data-accion="usr-eliminar" data-id="${u._id}">Eliminar</button>
          </td>
        </tr>`).join('') || filaVacia(6, 'No hay usuarios');
  });
}

$('#usuario-form').addEventListener('submit', (e) => {
  e.preventDefault();
  intentar(async () => {
    await api('/usuarios', {
      method: 'POST',
      body: {
        nombre: $('#usr-nombre').value,
        documento: $('#usr-documento').value,
        email: $('#usr-email').value,
        tipo: $('#usr-tipo').value,
      },
    });
    e.target.reset();
    mostrarMensaje('Usuario creado', 'ok');
    cargarUsuarios();
    cargarSelectsPrestamo();
  });
});

/* ---------- Préstamos ---------- */
const pad = (n) => String(n).padStart(2, '0');
function fechaLocal(diasDesdeHoy) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// El <input type="date"> da AAAA-MM-DD. Se envía ese día con la hora actual,
// así "hoy + 7 días" cae justo en el límite que valida la API.
function fechaConHoraActual(valor) {
  const [y, m, d] = valor.split('-').map(Number);
  const ahora = new Date();
  return new Date(y, m - 1, d, ahora.getHours(), ahora.getMinutes(), ahora.getSeconds()).toISOString();
}

function actualizarLimitesFecha() {
  const sel = $('#pres-usuario');
  const tipo = sel.selectedOptions[0]?.dataset.tipo;
  const max = tipo === 'docente' ? 15 : 7;
  const inp = $('#pres-fecha');
  inp.min = fechaLocal(1);
  inp.max = fechaLocal(max);
  $('#pres-ayuda').textContent = tipo
    ? `Fecha límite: máximo ${max} días (${tipo}).`
    : 'Fecha límite: máximo 7 días (15 para docentes).';
}
$('#pres-usuario').addEventListener('change', actualizarLimitesFecha);

// El <select> de equipos solo muestra disponibles; el de usuarios solo activos
async function cargarSelectsPrestamo() {
  await intentar(async () => {
    const [equipos, usuarios] = await Promise.all([
      api('/equipos?estado=disponible'),
      api('/usuarios?activo=true'),
    ]);
    usuariosActivos = usuarios;
    $('#pres-equipo').innerHTML =
      '<option value="">Equipo disponible…</option>' +
      equipos.map((e) => `<option value="${e._id}">${esc(e.codigo)} · ${esc(e.nombre)}</option>`).join('');
    $('#pres-usuario').innerHTML =
      '<option value="">Usuario activo…</option>' +
      usuarios.map((u) => `<option value="${u._id}" data-tipo="${esc(u.tipo)}">${esc(u.nombre)} (${esc(u.tipo)})</option>`).join('');
    actualizarLimitesFecha();
  });
}

async function cargarPrestamos() {
  await intentar(async () => {
    const f = $('#filtro-prestamos').value;
    const q = { activo: '?estado=activo', vencidos: '?vencidos=true', devuelto: '?estado=devuelto', todos: '' }[f];
    const prestamos = await api(`/prestamos${q}`);

    $('#tabla-prestamos tbody').innerHTML =
      prestamos.map((p) => `
        <tr class="${p.vencido ? 'fila-vencida' : ''}">
          <td>${p.equipo ? `<b>${esc(p.equipo.codigo)}</b> · ${esc(p.equipo.nombre)}` : '(equipo eliminado)'}</td>
          <td>${p.usuario ? `${esc(p.usuario.nombre)} (${esc(p.usuario.tipo)})` : '(usuario eliminado)'}</td>
          <td>${fmtFecha(p.fechaPrestamo)}</td>
          <td>${fmtFecha(p.fechaLimite)}</td>
          <td>
            <span class="badge ${p.estado === 'activo' ? 'warn' : 'ok'}">${esc(p.estado)}</span>
            ${p.vencido ? '<span class="badge danger">VENCIDO</span>' : ''}
          </td>
          <td class="solo-admin">
            ${p.estado === 'activo' ? `<button class="btn btn-primario btn-chico" data-accion="devolver" data-id="${p._id}">Devolver</button>` : '—'}
          </td>
        </tr>`).join('') || filaVacia(6, 'No hay préstamos en esta vista');
  });
}
$('#filtro-prestamos').addEventListener('change', cargarPrestamos);

$('#prestamo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  intentar(async () => {
    const body = {
      equipoId: $('#pres-equipo').value,
      usuarioId: $('#pres-usuario').value,
      fechaLimite: fechaConHoraActual($('#pres-fecha').value),
    };
    const obs = $('#pres-obs').value.trim();
    if (obs) body.observaciones = obs;

    const p = await api('/prestamos', { method: 'POST', body });
    e.target.reset();
    mostrarMensaje(`Préstamo registrado: ${p.equipo.codigo} → ${p.usuario.nombre}`, 'ok');
    refrescarTodo();
  });
});

/* ---------- Resumen ---------- */
async function cargarResumen() {
  await intentar(async () => {
    const [r, top] = await Promise.all([api('/reportes/resumen'), api('/reportes/top-equipos?limit=5')]);
    const dato = (num, etq, extra = '') => `<div class="dato ${extra}"><div class="num">${num}</div><div class="etq">${etq}</div></div>`;
    $('#resumen-tarjetas').innerHTML = [
      dato(r.equiposPorEstado.disponible, 'Equipos disponibles'),
      dato(r.equiposPorEstado.prestado, 'Equipos prestados'),
      dato(r.equiposPorEstado.mantenimiento, 'En mantenimiento'),
      dato(r.prestamosActivos, 'Préstamos activos'),
      dato(r.prestamosVencidos, 'Préstamos vencidos', r.prestamosVencidos > 0 ? 'alerta' : ''),
      dato(r.activosPorTipoUsuario.estudiante, 'Activos: estudiantes'),
      dato(r.activosPorTipoUsuario.docente, 'Activos: docentes'),
      dato(r.activosPorTipoUsuario.administrativo, 'Activos: administrativos'),
    ].join('');

    $('#top-lista').innerHTML =
      top.map((t) => `<li><b>${esc(t.codigo)}</b> · ${esc(t.nombre)} <span class="badge gris">${t.totalPrestamos} préstamos</span></li>`).join('') ||
      '<li>Aún no hay préstamos</li>';
  });
}

/* ---------- Acciones de las tablas (delegación de eventos) ---------- */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const { accion, id } = btn.dataset;

  intentar(async () => {
    if (accion === 'eq-eliminar') {
      if (!confirm('¿Eliminar este equipo?')) return;
      await api(`/equipos/${id}`, { method: 'DELETE' });
      mostrarMensaje('Equipo eliminado', 'ok');
      cargarEquipos(); cargarSelectsPrestamo(); cargarResumen();
    } else if (accion === 'eq-estado') {
      await api(`/equipos/${id}`, { method: 'PUT', body: { estado: btn.dataset.estado } });
      mostrarMensaje('Estado actualizado', 'ok');
      cargarEquipos(); cargarSelectsPrestamo(); cargarResumen();
    } else if (accion === 'usr-eliminar') {
      if (!confirm('¿Eliminar este usuario?')) return;
      await api(`/usuarios/${id}`, { method: 'DELETE' });
      mostrarMensaje('Usuario eliminado', 'ok');
      cargarUsuarios(); cargarSelectsPrestamo();
    } else if (accion === 'usr-activo') {
      await api(`/usuarios/${id}`, { method: 'PUT', body: { activo: btn.dataset.activo === 'true' } });
      mostrarMensaje('Usuario actualizado', 'ok');
      cargarUsuarios(); cargarSelectsPrestamo();
    } else if (accion === 'devolver') {
      await api(`/prestamos/${id}/devolver`, { method: 'PATCH' });
      mostrarMensaje('Préstamo devuelto', 'ok');
      refrescarTodo();
    }
  });
});

/* ---------- Arranque ---------- */
actualizarSesion();
refrescarTodo();
// Si había un token guardado, comprobar que sigue siendo válido
if (token) api('/auth/me').catch(() => {});
