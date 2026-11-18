// Mensajes de Joi en español (se aplican a todas las validaciones)
const MENSAJES = {
  "any.required": "{{#label}} es obligatorio",
  "any.only": "{{#label}} debe ser uno de: {{#valids}}",
  "string.base": "{{#label}} debe ser texto",
  "string.empty": "{{#label}} no puede estar vacío",
  "string.min": "{{#label}} debe tener al menos {{#limit}} caracteres",
  "string.max": "{{#label}} no puede superar {{#limit}} caracteres",
  "string.email": "{{#label}} no es un correo válido",
  "string.pattern.base": "{{#label}} tiene un formato inválido",
  "number.base": "{{#label}} debe ser un número",
  "number.integer": "{{#label}} debe ser un número entero",
  "number.min": "{{#label}} debe ser como mínimo {{#limit}}",
  "number.max": "{{#label}} debe ser como máximo {{#limit}}",
  "date.base": "{{#label}} debe ser una fecha válida",
  "date.format": "{{#label}} debe ser una fecha válida (formato AAAA-MM-DD)",
  "boolean.base": "{{#label}} debe ser verdadero o falso",
  "object.base": "El cuerpo de la solicitud debe ser un objeto JSON",
  "object.min": "Debes enviar al menos un campo",
};

// Valida con Joi: reporta todos los errores y descarta campos desconocidos
export const validar = (schema, valor) =>
  schema.validateAsync(valor ?? {}, {
    abortEarly: false,
    stripUnknown: true,
    messages: MENSAJES,
    errors: { wrap: { label: false, array: false } },
  });

// Campos que se resuelven con populate (los pide el enunciado)
export const POPULATE_EQUIPO = {
  path: "equipoId",
  select: "codigo nombre categoria",
};
export const POPULATE_USUARIO = { path: "usuarioId", select: "nombre tipo" };

// Recibe un préstamo (objeto plano, con .lean()) y devuelve el JSON final:
// equipoId/usuarioId pasan a llamarse equipo/usuario y se calcula "vencido" (R6).
export function serializarPrestamo(p, ahora = new Date()) {
  const { equipoId, usuarioId, __v, ...resto } = p;
  return {
    ...resto,
    equipo: equipoId,
    usuario: usuarioId,
    vencido: p.estado === "activo" && new Date(p.fechaLimite) < ahora,
  };
}
