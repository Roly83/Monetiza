// Textos legales mínimos (LSSI-CE, RGPD, cookies). Completa los datos del titular en site.config.json -> "titular".
const titular = (c) => c.titular ?? { nombre: '[Nombre del titular]', nif: '[NIF]', email: '[email de contacto]' };

export const paginasLegales = [
  {
    slug: 'aviso-legal',
    titulo: 'Aviso legal',
    cuerpo: (c) => {
      const t = titular(c);
      return `En cumplimiento de la Ley 34/2002 (LSSI-CE) se informa de que este sitio web es titularidad de **${t.nombre}**, con NIF ${t.nif} y correo de contacto ${t.email}.

Los contenidos y calculadoras tienen carácter **meramente informativo** y no constituyen asesoramiento fiscal, laboral ni jurídico. El titular no se responsabiliza de las decisiones tomadas a partir de ellos. Consulta siempre con un profesional para tu caso concreto.

Este sitio participa en programas de afiliación: algunos enlaces generan una comisión para el titular si el usuario contrata un servicio, sin coste adicional para él.`;
    },
  },
  {
    slug: 'privacidad',
    titulo: 'Política de privacidad',
    cuerpo: (c) => {
      const t = titular(c);
      return `**Responsable:** ${t.nombre} (${t.email}).

Las calculadoras funcionan íntegramente en tu navegador: **los datos que introduces no se envían ni se guardan** en ningún servidor.

Si te suscribes a la newsletter, tu email se trata con tu consentimiento para enviarte comunicaciones, a través del proveedor de email indicado en el formulario. Puedes darte de baja en cualquier momento.

Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${t.email}, y reclamar ante la Agencia Española de Protección de Datos (aepd.es).`;
    },
  },
  {
    slug: 'cookies',
    titulo: 'Política de cookies',
    cuerpo: (c) => `${c.adsense.clienteId
      ? 'Este sitio muestra publicidad de **Google AdSense**, que puede usar cookies para personalizar anuncios. Google gestiona el consentimiento mediante su plataforma de gestión de consentimiento (CMP) certificada por el IAB. Más información en policies.google.com/technologies/ads.'
      : 'Actualmente este sitio **no utiliza cookies** propias ni de terceros con fines publicitarios.'}

${c.analitica.plausibleDominio ? 'La analítica se realiza con Plausible, una herramienta que no usa cookies ni recopila datos personales.' : ''}

Puedes eliminar o bloquear las cookies desde la configuración de tu navegador.`,
  },
];
