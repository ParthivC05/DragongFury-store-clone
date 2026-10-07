const SCRIPT_PREFIX = 'pj-schema-';

function setJsonLd(id, data) {
  const scriptId = SCRIPT_PREFIX + id;
  let el = document.getElementById(scriptId);
  if (!data) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = scriptId;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function clearJsonLd(id) {
  const el = document.getElementById(SCRIPT_PREFIX + id);
  if (el) el.remove();
}

export function applyManagedSchema(schema) {
  clearJsonLd('page');
  clearJsonLd('webpage');
  clearJsonLd('breadcrumb');
  if (!schema) return;
  const nodes = Array.isArray(schema['@graph']) ? schema['@graph'] : [schema];
  const types = new Set(nodes.map((node) => node && node['@type']).filter(Boolean));
  if (types.has('Organization')) clearJsonLd('organization');
  if (types.has('WebSite')) clearJsonLd('website');
  if (schema['@type'] === 'Organization') {
    setJsonLd('organization', schema);
    return;
  }
  if (schema['@type'] === 'WebSite') {
    setJsonLd('website', schema);
    return;
  }
  if (schema['@type'] === 'WebPage') {
    setJsonLd('webpage', schema);
    return;
  }
  if (schema['@type'] === 'BreadcrumbList') {
    setJsonLd('breadcrumb', schema);
    return;
  }
  setJsonLd('page', schema);
}

export function applySitewideSchema() {}
