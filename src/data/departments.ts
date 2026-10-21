// Standard SDA departments / offices from the Church Manual (2022, Ch. 8)
// Each entry is bilingual so the dropdown follows the EN/ES toggle.
export interface DepartmentPreset {
  id: string
  en: string
  es: string
  /** Typical position title inside this department */
  roleEn: string
  roleEs: string
}

export const DEPARTMENTS: DepartmentPreset[] = [
  { id: 'elders', en: 'Elders', es: 'Ancianos', roleEn: 'Elder', roleEs: 'Anciano' },
  { id: 'deacons', en: 'Deacons', es: 'Diáconos', roleEn: 'Head Deacon', roleEs: 'Diácono Principal' },
  { id: 'deaconesses', en: 'Deaconesses', es: 'Diaconisas', roleEn: 'Head Deaconess', roleEs: 'Diaconisa Principal' },
  { id: 'clerk', en: 'Church Clerk', es: 'Secretaría de Iglesia', roleEn: 'Church Clerk', roleEs: 'Secretario/a de Iglesia' },
  { id: 'treasury', en: 'Treasury', es: 'Tesorería', roleEn: 'Treasurer', roleEs: 'Tesorero/a' },
  { id: 'sabbath-school', en: 'Sabbath School', es: 'Escuela Sabática', roleEn: 'Superintendent', roleEs: 'Superintendente' },
  { id: 'personal-ministries', en: 'Personal Ministries', es: 'Ministerios Personales', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'community-services', en: 'Adventist Community Services / Dorcas', es: 'Servicios a la Comunidad / Dorcas', roleEn: 'Director', roleEs: 'Director/a' },
  { id: 'children', en: "Children's Ministries", es: 'Ministerios Infantiles', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'youth', en: 'Adventist Youth Ministries', es: 'Ministerios Juveniles', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'adventurers', en: 'Adventurer Club', es: 'Club de Aventureros', roleEn: 'Director', roleEs: 'Director/a' },
  { id: 'pathfinders', en: 'Pathfinder Club', es: 'Club de Conquistadores', roleEn: 'Director', roleEs: 'Director/a' },
  { id: 'ambassadors', en: 'Ambassador Club', es: 'Club de Embajadores', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'family', en: 'Family Ministries', es: 'Ministerios de la Familia', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'women', en: "Women's Ministries", es: 'Ministerios de la Mujer', roleEn: 'Leader', roleEs: 'Directora' },
  { id: 'men', en: 'Adventist Men', es: 'Ministerios de Hombres', roleEn: 'Coordinator', roleEs: 'Coordinador' },
  { id: 'health', en: 'Health Ministries', es: 'Ministerios de Salud', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'stewardship', en: 'Stewardship Ministries', es: 'Mayordomía', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'religious-liberty', en: 'Religious Liberty', es: 'Libertad Religiosa', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'communication', en: 'Communication', es: 'Comunicaciones', roleEn: 'Secretary / Chair', roleEs: 'Secretario/a' },
  { id: 'education', en: 'Education', es: 'Educación', roleEn: 'Secretary', roleEs: 'Secretario/a' },
  { id: 'music', en: 'Music Ministries', es: 'Ministerios de Música', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'publishing', en: 'Publishing Ministries', es: 'Ministerios de Publicaciones', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'possibility', en: 'Possibility Ministries (Disabilities)', es: 'Ministerios de Posibilidades (Discapacidades)', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'interest', en: 'Interest Coordinator / Bible School', es: 'Coordinador de Interesados / Escuela Bíblica', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'prayer', en: 'Prayer Ministries', es: 'Ministerios de Oración', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'hospitality', en: 'Hospitality Ministries', es: 'Ministerios de Hospitalidad', roleEn: 'Coordinator', roleEs: 'Coordinador/a' },
  { id: 'home-school', en: 'Home and School Association', es: 'Asociación Hogar y Escuela', roleEn: 'Leader', roleEs: 'Director/a' },
  { id: 'vbs', en: 'Vacation Bible School', es: 'Escuela Bíblica de Vacaciones', roleEn: 'Director', roleEs: 'Director/a' },
  { id: 'public-campus', en: 'Public Campus Ministries', es: 'Ministerios en Campus Públicos', roleEn: 'Leader / Coordinator', roleEs: 'Director/a / Coordinador/a' },
  { id: 'custom', en: 'Custom department…', es: 'Departamento personalizado…', roleEn: '', roleEs: '' },
]
