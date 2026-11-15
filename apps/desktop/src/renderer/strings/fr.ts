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
    home: 'Accueil',
    coverName: 'Couverture',
    spreadName: (n: number) => `Double page ${n}`,
    formatCaption: (width: number, height: number) => `${width} × ${height} mm`,
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
  // Autosave state in the top bar, and the notes that follow Ctrl+S.
  save: {
    saved: 'Enregistré',
    saving: 'Enregistrement…',
    failed: "Échec de l'enregistrement",
    retry: 'Réessayer',
    snapshotSaved: 'Version enregistrée',
    snapshotFailed: "La version n'a pas pu être enregistrée",
  },
  // Notice shown over the canvas when originals are missing at open.
  missing: {
    title: (count: number) =>
      count === 1
        ? 'Un fichier original est introuvable'
        : `${count} fichiers originaux sont introuvables`,
    hint: "Les photos concernées s'affichent mal ou pas du tout. Remettez les fichiers dans le dossier originals de l'album.",
    dismiss: 'Fermer cet avertissement',
  },
  // Home screen.
  home: {
    heading: 'Vos albums',
    newBook: 'Nouveau livre',
    open: 'Ouvrir',
    recent: 'Albums récents',
    emptyTitle: 'Aucun album récent',
    emptyHint: 'Créez un livre, ou ouvrez un dossier .travelbook déjà existant.',
    openedOn: (date: string) => `Ouvert le ${date}`,
    coverAlt: (title: string) => `Couverture de ${title}`,
    createFailed: "Le livre n'a pas pu être créé. Vérifiez le dossier choisi et réessayez.",
    openFailed:
      "Le livre n'a pas pu être ouvert. Vérifiez que son dossier existe encore et réessayez.",
  },
  // New book dialog.
  newBook: {
    title: 'Nouveau livre',
    titleField: 'Titre',
    titlePlaceholder: 'Islande 2026',
    folderField: 'Dossier',
    folderEmpty: 'Aucun dossier choisi',
    folderHelp: 'Le livre sera créé dans ce dossier, dans un sous-dossier .travelbook.',
    chooseFolder: 'Choisir…',
    formatField: 'Format des pages',
    width: 'Largeur',
    height: 'Hauteur',
    unit: 'mm',
    sizeHelp: 'Entre 50 et 600 mm.',
    custom: 'Personnalisé',
    cancel: 'Annuler',
    create: 'Créer le livre',
    presets: {
      'a4-portrait': 'A4 portrait',
      'a4-landscape': 'A4 paysage',
      a5: 'A5',
      'square-21': '21 × 21 cm',
      'square-30': '30 × 30 cm',
      'portrait-24x32': '24 × 32 cm',
    },
  },
  // Dialog shown by the main process when saving before close fails.
  closeDialog: {
    title: 'Fermer travelbook',
    message: "L'album n'a pas pu être enregistré.",
    failed: "Les dernières modifications n'ont pas été écrites sur le disque.",
    timeout: "L'enregistrement prend trop de temps.",
    retry: 'Réessayer',
    quit: 'Quitter sans enregistrer',
    cancel: 'Annuler',
  },
  // Native dialogs opened by the main process.
  dialogs: {
    chooseAlbumFolder: "Choisir le dossier où créer l'album",
    chooseAlbumToOpen: 'Ouvrir un album',
    choosePhotos: 'Importer des photos',
    imageFilter: 'Images',
  },
} as const;
