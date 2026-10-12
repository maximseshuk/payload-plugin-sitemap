import type { Payload } from 'payload'

const TOPICS = [
  ['coffee', 'Coffee', 'Kaffee', 'Café'],
  ['garden', 'Garden', 'Garten', 'Jardin'],
  ['kitchen', 'Kitchen', 'Küche', 'Cuisine'],
  ['travel', 'Travel', 'Reisen', 'Voyage'],
  ['bicycle', 'Bicycle', 'Fahrrad', 'Vélo'],
  ['camera', 'Camera', 'Kamera', 'Appareil photo'],
  ['winter', 'Winter', 'Winter', 'Hiver'],
  ['summer', 'Summer', 'Sommer', 'Été'],
  ['bread', 'Bread', 'Brot', 'Pain'],
  ['music', 'Music', 'Musik', 'Musique'],
  ['office', 'Office', 'Büro', 'Bureau'],
  ['school', 'School', 'Schule', 'École'],
  ['mountain', 'Mountain', 'Berg', 'Montagne'],
  ['river', 'River', 'Fluss', 'Rivière'],
  ['market', 'Market', 'Markt', 'Marché'],
  ['library', 'Library', 'Bibliothek', 'Bibliothèque'],
  ['studio', 'Studio', 'Atelier', 'Atelier'],
  ['harbor', 'Harbor', 'Hafen', 'Port'],
  ['forest', 'Forest', 'Wald', 'Forêt'],
  ['island', 'Island', 'Insel', 'Île'],
] as const

const KINDS = [
  ['guide', 'guide', 'ratgeber', 'guide'],
  ['tips', 'tips', 'tipps', 'conseils'],
  ['checklist', 'checklist', 'checkliste', 'liste'],
  ['faq', 'FAQ', 'faq', 'faq'],
  ['news', 'news', 'neuigkeiten', 'actualites'],
  ['events', 'events', 'termine', 'evenements'],
  ['pricing', 'pricing', 'preise', 'tarifs'],
  ['team', 'team', 'team', 'equipe'],
  ['history', 'history', 'geschichte', 'histoire'],
  ['gallery', 'gallery', 'galerie', 'galerie'],
] as const

const YEARS = [2024, 2025]

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-|-$/g, '')

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export const seed = async (payload: Payload): Promise<void> => {
  const { totalDocs } = await payload.count({ collection: 'users', overrideAccess: true })
  if (totalDocs > 0) return

  const create = (collection: 'authors' | 'categories' | 'pages' | 'posts', data: Record<string, unknown>) =>
    payload.create({ collection, data, locale: 'en', overrideAccess: true })
  const translate = (collection: 'categories' | 'pages', id: number | string, locale: string, data: object) =>
    payload.update({ collection, data, id, locale, overrideAccess: true })

  await payload.create({
    collection: 'users',
    data: { email: 'dev@payloadcms.com', password: 'test', role: 'admin' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'users',
    data: { email: 'editor@payloadcms.com', password: 'test', role: 'editor' },
    overrideAccess: true,
  })

  for (const [slug, en, de, fr] of [
    ['home', 'Home', 'Startseite', 'Accueil'],
    ['about', 'About us', 'Über uns', 'À propos'],
    ['contact', 'Contact', 'Kontakt', 'Contact'],
    ['imprint', 'Imprint', 'Impressum', 'Mentions légales'],
  ] as const) {
    const page = await create('pages', { _status: 'published', noindex: slug === 'imprint', slug, title: en })
    await translate('pages', page.id, 'de', { _status: 'published', slug: slugify(de), title: de })
    await translate('pages', page.id, 'fr', { _status: 'published', slug: slugify(fr), title: fr })
  }

  for (const year of YEARS) {
    for (const [topic, en, de, fr] of TOPICS) {
      for (const [kind, enKind, deKind, frKind] of KINDS) {
        const page = await create('pages', {
          _status: 'published',
          slug: `${topic}-${kind}-${year}`,
          title: `${en} ${enKind} ${year}`,
        })
        await translate('pages', page.id, 'de', {
          _status: 'published',
          slug: slugify(`${de}-${deKind}-${year}`),
          title: `${de} ${capitalize(deKind)} ${year}`,
        })
        await translate('pages', page.id, 'fr', {
          _status: 'published',
          slug: slugify(`${fr}-${frKind}-${year}`),
          title: `${fr} : ${frKind} ${year}`,
        })
      }
    }
  }

  for (const [topic, en, de, fr] of TOPICS) {
    const category = await create('categories', { slug: topic, title: en })
    await translate('categories', category.id, 'de', { title: de })
    await translate('categories', category.id, 'fr', { title: fr })
  }

  for (const name of ['Anna Weber', 'Luca Rossi', 'Marie Dubois', 'Jonas Berg', 'Sofia Lind', 'Tom Baker']) {
    await create('authors', { name, slug: slugify(name) })
  }

  let index = 0
  for (const [topic, en] of TOPICS) {
    for (const [kind, enKind] of KINDS) {
      for (const part of [1, 2, 3]) {
        index++
        await create('posts', {
          category: { slug: topic },
          featured: index % 7 === 0,
          image: index % 3 === 0 ? undefined : `https://images.example.com/blog/${topic}-${kind}-${part}.jpg`,
          slug: `${topic}-${kind}-part-${part}`,
          title: `${en} ${enKind}, part ${part}`,
        })
      }
    }
  }
}
