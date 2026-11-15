// French UI dictionary. Every user-visible string of the renderer lives here.
export const fr = {
  app: {
    name: 'travelbook',
  },
  // Editor shell: accessible names of its regions and their empty states.
  shell: {
    topBar: 'Barre du haut',
    rail: 'Outils',
    panel: (name: string) => `Panneau ${name}`,
    canvas: 'Plan de travail',
    inspector: 'Inspecteur',
    spreads: 'Doubles pages',
    resizePanel: 'Largeur du panneau',
    resizeInspector: "Largeur de l'inspecteur",
    undo: 'Annuler',
    redo: 'Rétablir',
    themeToDark: 'Passer au thème sombre',
    themeToLight: 'Passer au thème clair',
    noAlbum: 'Aucun album ouvert',
    panelEmpty: 'Ouvrez un album pour utiliser ce panneau.',
    inspectorEmpty: 'Sélectionnez un élément pour voir ses propriétés.',
    spreadsEmpty: "Les doubles pages de l'album apparaîtront ici.",
  },
  // Rail entries, in rail order; also the panel titles.
  panels: {
    photos: 'Photos',
    templates: 'Modèles',
    stickers: 'Stickers',
    backgrounds: 'Fonds',
    text: 'Texte',
    shapes: 'Formes',
  },
  // Native dialogs opened by the main process.
  dialogs: {
    chooseAlbumFolder: "Choisir le dossier où créer l'album",
    chooseAlbumToOpen: 'Ouvrir un album',
    choosePhotos: 'Importer des photos',
    imageFilter: 'Images',
  },
} as const;
