export interface Distributeur {
  nom: string; // clé, aussi le nom du fichier Excel (<nom>.xlsx)
  mail: string; // '' si créé automatiquement (nouveau pays) — à compléter par le directeur
  zone: string; // règle actuelle : le pays. Amenée à changer.
  dateRelance?: string;
}
