import { applyPageSeo, applyRobotsMeta } from './pageSeo';
import { applyManagedSchema } from './managedSchema';

function currentMeta(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
}

export function applyCommonPageSeo(saved) {
  if (!saved) return false;
  const title = String(saved.title || '').trim();
  const description = String(saved.description || '').trim();
  const keywords = String(saved.keywords || '').trim();
  const noindex = String(saved.robots || '').toLowerCase().includes('noindex');
  if (!title && !description && !keywords && !saved.canonical && !saved.schema && !noindex) {
    return false;
  }
  if (title || description || keywords) {
    applyPageSeo({
      title: title || (typeof document !== 'undefined' ? document.title : ''),
      description: description || currentMeta('description'),
      keywords: keywords || currentMeta('keywords'),
      url: saved.canonical
    });
  }
  applyRobotsMeta(saved.robots || 'index, follow');
  if (typeof document !== 'undefined') {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!saved.canonical) {
      canonical?.remove();
    } else {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', saved.canonical);
    }
  }
  if (saved.schema) applyManagedSchema(saved.schema);
  return true;
}
