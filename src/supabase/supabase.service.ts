/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Interfacce tipizzate
interface ScrapedMeta {
  tags: string[];
  parodies: string[];
  chars: string[];
  groups: string[];
  artist: string;
  cat: string;
  langs: string[];
}

interface MangaResponse {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: string[];
  visible: boolean;
  categoria_id: number | null;
  artista_id: number | null;
}

export interface MangaWithRelations extends MangaResponse {
  artisti: { nome: string } | null;
  categorie: { nome: string } | null;
  tags?: { nome: string }[];
  characters?: { nome: string }[];
  parodies?: { nome: string }[];
  gruppi?: { nome: string }[];
}

export interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Tipi per le risposte Supabase
interface TagRelation {
  tags: { id: number; nome: string };
}

interface CharacterRelation {
  characters: { id: number; nome: string };
}

interface ParodyRelation {
  parodies: { id: number; nome: string };
}

interface GruppoRelation {
  gruppi: { id: number; nome: string };
}

interface MangaWithRelationsRaw {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string | null;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: string[];
  visible: boolean | null;
  categoria_id: number | null;
  artista_id: number | null;
  artisti: { nome: string } | null;
  categorie: { nome: string } | null;
  manga_tags?: TagRelation[];
  manga_characters?: CharacterRelation[];
  manga_parodies?: ParodyRelation[];
  manga_gruppi?: GruppoRelation[];
}

// Categorie valide per il database
const VALID_CATEGORIES = ['manga', 'doujinshi', 'manhwa', 'comics'];

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  public readonly supabase: SupabaseClient;

  // Cache per metadata
  private metadataCache = new Map<string, CacheEntry<number | null>>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minuti

  // Rate limiting
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 secondo

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    const serviceRoleKey = this.configService.get<string>('SUPABASE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be defined');
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  onModuleInit() {
    this.logger.log('🚀 KitsuneMojo Engine: Validation & Debug Active');
  }

  /**
   * Rispetta il rate limiting tra le richieste
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await this.delay(this.MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validazione URL
   */
  private validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('hentaifox.com');
    } catch {
      return false;
    }
  }

  /**
   * Logging strutturato
   */
  private log(
    level: 'debug' | 'log' | 'error',
    message: string,
    context?: Record<string, any>,
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      service: 'SupabaseService',
    };

    const logString = JSON.stringify(logEntry);

    switch (level) {
      case 'debug':
        this.logger.debug(logString);
        break;
      case 'error':
        this.logger.error(logString);
        break;
      default:
        this.logger.log(logString);
    }
  }

  // --- VALIDAZIONE IMMAGINI (TEST REALE) ---
  private async validateExtension(baseUrl: string): Promise<string> {
    const extensions = ['webp', 'jpg', 'png'];

    for (const ext of extensions) {
      try {
        await this.respectRateLimit();

        const testUrl = `${baseUrl}1.${ext}`;
        await axios.head(testUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://hentaifox.com/',
          },
          timeout: 5000,
        });

        this.log('debug', `Estensione trovata: ${ext}`, { url: baseUrl });
        return ext;
      } catch {
        continue;
      }
    }

    this.log('debug', 'Nessuna estensione valida trovata, uso jpg di default', {
      url: baseUrl,
    });
    return 'jpg';
  }

  // --- LOGICA DI SINCRONIZZAZIONE METADATI (N:N) CON BATCH PROCESSING ---
  private async syncMetadata(
    tableName: string,
    pivotTable: string,
    mangaId: number,
    names: string[],
  ): Promise<void> {
    if (!names.length) {
      this.log('debug', `Nessun metadata da sincronizzare per ${tableName}`);
      return;
    }

    console.log(`\n🔍 SYNC - Inizio sincronizzazione per ${tableName}`);
    console.log(`🔍 SYNC - Nomi ricevuti:`, names);

    const uniqueNames = [...new Set(names)]
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    console.log(`🔍 SYNC - Nomi unici dopo pulizia:`, uniqueNames);
    console.log(
      `🔍 SYNC - Totale elementi da processare: ${uniqueNames.length}`,
    );

    // Batch processing per performance
    const BATCH_SIZE = 50;
    for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
      const batch = uniqueNames.slice(i, i + BATCH_SIZE);
      console.log(
        `🔍 SYNC - Processo batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
        batch,
      );
      await this.processMetadataBatch(tableName, pivotTable, mangaId, batch);
    }
  }

  private async processMetadataBatch(
    tableName: string,
    pivotTable: string,
    mangaId: number,
    names: string[],
  ): Promise<void> {
    const results = await Promise.allSettled(
      names.map(async (name) => {
        try {
          console.log(
            `🔍 PROCESS - Elaborazione nome: "${name}" per tabella ${tableName}`,
          );

          // Usa cache per evitare chiamate duplicate
          const recordId = await this.getOrCreateMetadataIdCached(
            tableName,
            name,
          );

          console.log(
            `🔍 PROCESS - recordId ottenuto: ${recordId} per "${name}"`,
          );

          if (!recordId) {
            this.log(
              'error',
              `Impossibile creare/ottenere record per ${name} in ${tableName}`,
            );
            return;
          }

          const pivotColumn = this.getPivotColumn(tableName);
          console.log(`🔍 PROCESS - pivotColumn: ${pivotColumn}`);

          const { error: pivotErr } = await this.supabase
            .from(pivotTable)
            .upsert(
              { manga_id: mangaId, [pivotColumn]: recordId },
              { onConflict: `manga_id,${pivotColumn}` },
            );

          if (pivotErr) {
            console.log(`❌ PROCESS - Errore pivot:`, pivotErr);
            this.log('error', `Errore pivot ${pivotTable}`, {
              error: pivotErr.message,
              name,
              mangaId,
            });
          } else {
            console.log(
              `✅ PROCESS - Inserito pivot per ${name} in ${pivotTable}`,
            );
            // Aggiorna counter in background (non aspettiamo)
            this.updateCounter(tableName, pivotTable, recordId).catch((err) => {
              this.log('error', `Errore aggiornamento counter`, {
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          console.log(`❌ PROCESS - Errore critico:`, err);
          this.log('error', `Errore critico processing batch`, {
            error: err instanceof Error ? err.message : String(err),
            name,
            tableName,
          });
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.log(
        `❌ SYNC - ${failed} operazioni fallite nel batch per ${tableName}`,
      );
      this.log(
        'error',
        `${failed} operazioni fallite nel batch per ${tableName}`,
      );
    } else {
      console.log(`✅ SYNC - Batch completato con successo per ${tableName}`);
    }
  }

  private getPivotColumn(table: string): string {
    const mapping: Record<string, string> = {
      gruppi: 'gruppo_id',
      parodies: 'parody_id',
      characters: 'character_id',
      tags: 'tag_id',
    };
    return mapping[table] || 'tag_id';
  }

  // --- CORE: AUTO IMPORT CON MIGLIORAMENTI ---
  public async autoImport(url: string): Promise<ImportResult> {
    try {
      // Validazione URL
      if (!this.validateUrl(url)) {
        throw new Error(
          'URL non valido o non supportato. Sono supportati solo URL di hentaifox.com',
        );
      }

      // Verifica duplicati
      const isDuplicate = await this.checkDuplicate(url);
      if (isDuplicate) {
        this.log('log', `URL già importato: ${url}`);
        return {
          success: false,
          error: 'Questo manga è già stato importato',
        };
      }

      this.log('log', `📥 Importazione avviata: ${url}`);

      // Rate limiting per scraping
      await this.respectRateLimit();

      const { data: html } = await axios.get<string>(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
          Referer: 'https://hentaifox.com/',
        },
        timeout: 10000,
      });

      // === LOG DEBUG HTML ===
      console.log('\n🔍🔍🔍 DEBUG IMPORT 🔍🔍🔍');
      console.log('🔍 DEBUG - HTML ricevuto, lunghezza:', html.length);
      console.log('🔍 DEBUG - Primi 500 caratteri:', html.substring(0, 500));
      // =====================

      const $ = cheerio.load(html);

      // === LOG DEBUG SELEZIONE TITOLO ===
      console.log('🔍 DEBUG - Cerco .info h1...');
      const titoloElement = $('.info h1');
      console.log(
        '🔍 DEBUG - Trovato?',
        titoloElement.length > 0 ? 'SÌ' : 'NO',
      );
      if (titoloElement.length > 0) {
        console.log('🔍 DEBUG - HTML elemento:', titoloElement.html());
        console.log('🔍 DEBUG - Testo elemento:', titoloElement.text());
      }
      // ================================

      // Prova selettori alternativi se il primo non funziona
      let titolo = titoloElement.text().trim();

      if (!titolo) {
        console.log('🔍 DEBUG - Provo selettori alternativi...');

        const alternativeSelectors = [
          { selector: 'h1', type: 'element' },
          { selector: '.gallery h1', type: 'element' },
          { selector: 'title', type: 'element' },
          {
            selector: 'meta[property="og:title"]',
            type: 'meta',
            attr: 'content',
          },
          { selector: 'meta[name="title"]', type: 'meta', attr: 'content' },
          { selector: '.title', type: 'element' },
          { selector: '.gallery-title', type: 'element' },
        ];

        for (const sel of alternativeSelectors) {
          if (sel.type === 'meta') {
            const content = $(sel.selector).attr(sel.attr || 'content');
            if (content) {
              titolo = content.trim();
              console.log(
                `🔍 DEBUG - Trovato con meta ${sel.selector}:`,
                titolo,
              );
              break;
            }
          } else {
            const el = $(sel.selector).first();
            if (el.length > 0) {
              titolo = el.text().trim();
              if (titolo) {
                console.log(
                  `🔍 DEBUG - Trovato con selettore ${sel.selector}:`,
                  titolo,
                );
                break;
              }
            }
          }
        }
      }

      console.log('🔍 DEBUG - Titolo finale estratto:', titolo);

      if (!titolo) {
        // === LOG DEBUG STRUTTURA PAGINA ===
        console.log('🔍 DEBUG - Struttura completa della pagina:');
        const classes = $('*')
          .map((_, el) => $(el).attr('class'))
          .get()
          .filter(Boolean)
          .slice(0, 30);
        console.log('Classi trovate:', classes);

        // Salva l'HTML completo per debug
        console.log('🔍 DEBUG - HTML completo (primi 2000 caratteri):');
        console.log(html.substring(0, 2000));
        // ================================

        throw new Error(
          'Titolo non trovato nel DOM. La struttura della pagina potrebbe essere cambiata.',
        );
      }

      const meta: ScrapedMeta = {
        tags: [],
        parodies: [],
        chars: [],
        groups: [],
        artist: '',
        cat: '',
        langs: [],
      };

      // === NUOVI SELETTORI CORRETTI PER METADATA ===
      console.log('\n🔍 ESTRAZIONE METADATA CON NUOVI SELETTORI:');

      // 1. Artista - SE PRESENTE
      const artistElements = $('.artists a');
      if (artistElements.length > 0) {
        artistElements.each((_, el) => {
          const fullText = $(el).text().trim();
          const name = fullText.replace(/\s+\d+$/, '');
          if (name) {
            meta.artist = name;
            console.log(`  ✅ Artista trovato: "${name}"`);
          }
        });
      } else {
        console.log(`  ⚠️ Nessun artista trovato nella pagina`);
      }

      // 2. Categoria - FILTRATA SOLO PER VALORI VALIDI
      $('.categories a').each((_, el) => {
        const fullText = $(el).text().trim();
        const name = fullText.replace(/\s+\d+$/, '').toLowerCase();

        // Filtra solo le categorie valide
        if (name && VALID_CATEGORIES.includes(name)) {
          meta.cat = name;
          console.log(`  ✅ Categoria valida trovata: "${name}"`);
        } else if (name) {
          console.log(`  ⚠️ Categoria ignorata (non valida): "${name}"`);
        }
      });

      // 3. Tags - FUNZIONA GIA', NON TOCCARE
      $('.tags a').each((_, el) => {
        const fullText = $(el).text().trim();
        const name = fullText.replace(/\s+\d+$/, '');
        if (name) {
          meta.tags.push(name);
          console.log(`  ✅ Tag trovato: "${name}"`);
        }
      });

      // 4. Personaggi - (se presenti)
      $('.characters a').each((_, el) => {
        const fullText = $(el).text().trim();
        const name = fullText.replace(/\s+\d+$/, '');
        if (name) {
          meta.chars.push(name);
          console.log(`  ✅ Personaggio trovato: "${name}"`);
        }
      });

      // 5. Parodie - (se presenti)
      $('.parodies a').each((_, el) => {
        const fullText = $(el).text().trim();
        const name = fullText.replace(/\s+\d+$/, '');
        if (name) {
          meta.parodies.push(name);
          console.log(`  ✅ Parodia trovata: "${name}"`);
        }
      });

      // 6. Gruppi - (se presenti)
      $('.groups a').each((_, el) => {
        const fullText = $(el).text().trim();
        const name = fullText.replace(/\s+\d+$/, '');
        if (name) {
          meta.groups.push(name);
          console.log(`  ✅ Gruppo trovato: "${name}"`);
        }
      });

      // 7. Lingue - FILTRATE: SALVA SOLO LA PRIMA LINGUA PRINCIPALE (es. "english", non "translated")
      const languages: string[] = [];
      $('.languages a').each((_, el) => {
        const fullText = $(el).text().trim();
        const name = fullText.replace(/\s+\d+$/, '').toLowerCase();
        if (name) {
          languages.push(name);
          console.log(`  🔍 Lingua trovata: "${name}"`);
        }
      });

      // Filtra le lingue: prendi solo la prima non "translated" o se c'è solo "translated", prendi quella
      if (languages.length > 0) {
        // Cerca una lingua che non sia "translated"
        const mainLanguage = languages.find((lang) => lang !== 'translated');
        if (mainLanguage) {
          meta.langs = [mainLanguage];
          console.log(`  ✅ Lingua principale selezionata: "${mainLanguage}"`);
        } else {
          // Se c'è solo "translated", prendi quella
          meta.langs = [languages[0]];
          console.log(
            `  ✅ Lingua selezionata (solo translated): "${languages[0]}"`,
          );
        }
      }

      // Fallback per le lingue se non trovate con il selettore specifico
      if (meta.langs.length === 0) {
        const infoText = $('.info').text();
        const langMatch = infoText.match(/Language:\s*(\w+)/i);
        if (langMatch) {
          const lang = langMatch[1].toLowerCase();
          meta.langs.push(lang);
          console.log(`  ✅ Lingua trovata con fallback: "${lang}"`);
        }
      }

      console.log('\n🔍 METADATA ESTRATTI (RIEPILOGO):');
      console.log(
        'Artista:',
        `"${meta.artist}"`,
        'Lunghezza:',
        meta.artist.length,
      );
      console.log('Categoria:', `"${meta.cat}"`, 'Lunghezza:', meta.cat.length);
      console.log('Tags:', meta.tags);
      console.log('Parodies:', meta.parodies);
      console.log('Characters:', meta.chars);
      console.log('Groups:', meta.groups);
      console.log('Langs:', meta.langs);
      console.log('🔍 FINE METADATA\n');

      this.log('debug', `Metadata trovati`, {
        tags: meta.tags.length,
        artist: meta.artist || 'NON TROVATO',
        categories: meta.cat || 'NON TROVATO',
        parodies: meta.parodies.length,
        characters: meta.chars.length,
        groups: meta.groups.length,
      });

      // Elaborazione thumbnail e pagine
      let thumb = $('.cover img').attr('src') || '';
      if (thumb.startsWith('//')) thumb = 'https:' + thumb;

      const imgBase =
        thumb
          .replace(/t(\d*)\.hentaifox\.com/, 'i$1.hentaifox.com')
          .replace(/\/\d+t\./, '/')
          .split('/')
          .slice(0, -1)
          .join('/') + '/';

      const validatedExt = await this.validateExtension(imgBase);

      const pagesMatch = $('.info')
        .text()
        .match(/Pages:\s*(\d+)/i);
      const pagesCount = parseInt(pagesMatch ? pagesMatch[1] : '0', 10);

      if (pagesCount === 0) {
        throw new Error('Numero pagine non trovato o uguale a zero');
      }

      const pagesList = Array.from(
        { length: pagesCount },
        (_, i) => `${imgBase}${i + 1}.${validatedExt}`,
      );

      // Crea o ottieni ID metadata con log dettagliato
      this.log('debug', `Tentativo salvataggio artista: "${meta.artist}"`);
      this.log('debug', `Tentativo salvataggio categoria: "${meta.cat}"`);

      console.log('\n🔍 CREAZIONE ID METADATA:');
      const [artId, catId] = await Promise.all([
        this.getOrCreateMetadataIdWithLog('artisti', meta.artist),
        this.getOrCreateMetadataIdWithLog('categorie', meta.cat),
      ]);

      console.log('Risultati - artista_id:', artId, 'categoria_id:', catId);
      console.log('🔍 FINE CREAZIONE ID\n');

      this.log(
        'debug',
        `Risultati - artista_id: ${artId}, categoria_id: ${catId}`,
      );

      // Inserisci manga
      console.log('🔍 INSERIMENTO MANGA:');
      const { data: manga, error: mErr } = await this.supabase
        .from('manga')
        .upsert(
          {
            titolo,
            immagine: pagesList[0],
            pagine: pagesList,
            numero_pagine: pagesCount,
            url_origine: url,
            // Usa solo la prima lingua (o 'English' come default)
            lingua: meta.langs.length > 0 ? meta.langs[0] : 'English',
            artista_id: artId,
            categoria_id: catId,
            visible: true,
          },
          {
            onConflict: 'titolo',
            ignoreDuplicates: false,
          },
        )
        .select('id')
        .single();

      if (mErr || !manga) {
        console.log('❌ ERRORE INSERIMENTO MANGA:', mErr);
        throw new Error(
          `Errore DB Manga: ${mErr?.message || 'Manga non trovato dopo inserimento'}`,
        );
      }

      const mId = manga.id;
      console.log('✅ MANGA INSERITO CON ID:', mId);

      // Se artista non è stato salvato ma c'era il nome, riprova
      if (!artId && meta.artist) {
        console.log('🔍 RETRY ARTISTA - Tentativo di recupero...');
        this.log(
          'error',
          `Tentativo di recupero artista fallito per "${meta.artist}", riprovo...`,
        );
        const retryArtId = await this.forceCreateMetadata(
          'artisti',
          meta.artist,
        );
        if (retryArtId) {
          await this.supabase
            .from('manga')
            .update({ artista_id: retryArtId })
            .eq('id', mId);
          console.log(
            '✅ RETRY ARTISTA - Artista associato con ID:',
            retryArtId,
          );
          this.log(
            'log',
            `Artista "${meta.artist}" associato a manga ${mId} dopo retry`,
          );
        }
      }

      // Se categoria non è stata salvata ma c'era il nome, riprova
      if (!catId && meta.cat) {
        console.log('🔍 RETRY CATEGORIA - Tentativo di recupero...');
        this.log(
          'error',
          `Tentativo di recupero categoria fallito per "${meta.cat}", riprovo...`,
        );
        const retryCatId = await this.forceCreateMetadata(
          'categorie',
          meta.cat,
        );
        if (retryCatId) {
          await this.supabase
            .from('manga')
            .update({ categoria_id: retryCatId })
            .eq('id', mId);
          console.log(
            '✅ RETRY CATEGORIA - Categoria associata con ID:',
            retryCatId,
          );
          this.log(
            'log',
            `Categoria "${meta.cat}" associata a manga ${mId} dopo retry`,
          );
        }
      }

      // Sincronizza metadata in parallelo (tags funzionano già!)
      console.log('\n🔍 SINCRONIZZAZIONE METADATA:');
      await Promise.all([
        this.syncMetadata('tags', 'manga_tags', mId, meta.tags),
        this.syncMetadata('parodies', 'manga_parodies', mId, meta.parodies),
        this.syncMetadata('characters', 'manga_characters', mId, meta.chars),
        this.syncMetadata('gruppi', 'manga_gruppi', mId, meta.groups),
      ]);
      console.log('✅ SINCRONIZZAZIONE COMPLETATA\n');

      // Invalida cache per questo manga
      this.invalidateMangaCache(mId);

      this.log('log', `✅ Importazione completata: ${titolo} (ID: ${mId})`);

      return {
        success: true,
        title: titolo,
        id: mId,
      };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Errore sconosciuto durante import';
      this.log('error', `❌ Fallimento Import: ${msg}`, { url, error: err });
      console.log('❌ ERRORE IMPORT:', err);

      return {
        success: false,
        error: msg,
      };
    }
  }

  /**
   * Versione con log dettagliato per debug
   */
  private async getOrCreateMetadataIdWithLog(
    table: string,
    nome: string,
  ): Promise<number | null> {
    console.log(
      `  🔍 getOrCreateMetadataIdWithLog - table:${table}, nome:"${nome}"`,
    );

    if (!nome || !nome.trim()) {
      console.log(`  🔍 Nome vuoto per ${table}, salto`);
      this.log('debug', `[METADATA] Nome vuoto per ${table}, salto`);
      return null;
    }

    const trimmedNome = nome.trim();
    console.log(`  🔍 Cerco/creo in ${table}: "${trimmedNome}"`);

    try {
      // Prima cerca se esiste
      const { data: existing, error: searchError } = await this.supabase
        .from(table)
        .select('id')
        .eq('nome', trimmedNome)
        .maybeSingle();

      if (searchError) {
        console.log(`  ❌ Errore ricerca in ${table}:`, searchError);
        this.log(
          'error',
          `[METADATA] Errore ricerca in ${table}:`,
          searchError,
        );
      }

      if (existing) {
        console.log(`  ✅ Trovato esistente in ${table}: ID ${existing.id}`);
        this.log(
          'debug',
          `[METADATA] Trovato esistente in ${table}: ID ${existing.id}`,
        );
        return existing.id;
      }

      // Se non esiste, crealo
      console.log(`  🔍 Creazione nuovo record in ${table}...`);
      const { data: newRecord, error: insertError } = await this.supabase
        .from(table)
        .insert({ nome: trimmedNome })
        .select('id')
        .single();

      if (insertError) {
        console.log(`  ❌ Errore inserimento in ${table}:`, insertError);
        this.log(
          'error',
          `[METADATA] Errore inserimento in ${table}:`,
          insertError,
        );
        return null;
      }

      console.log(`  ✅ Creato nuovo in ${table}: ID ${newRecord.id}`);
      this.log(
        'debug',
        `[METADATA] Creato nuovo in ${table}: ID ${newRecord.id}`,
      );
      return newRecord.id;
    } catch (err) {
      console.log(`  ❌ Eccezione in ${table}:`, err);
      this.log('error', `[METADATA] Eccezione in ${table}:`, {
        error: err instanceof Error ? err.message : String(err),
        nome: trimmedNome,
      });
      return null;
    }
  }

  /**
   * Forza la creazione di metadata (utile per retry)
   */
  private async forceCreateMetadata(
    table: string,
    nome: string,
  ): Promise<number | null> {
    if (!nome || !nome.trim()) return null;

    const trimmedNome = nome.trim();
    console.log(`  🔍 FORCE - Creazione forzata in ${table}: "${trimmedNome}"`);

    try {
      const { data, error } = await this.supabase
        .from(table)
        .insert({ nome: trimmedNome })
        .select('id')
        .single();

      if (error) {
        // Se errore di duplicato, prova a recuperare
        if (error.code === '23505') {
          console.log(`  🔍 FORCE - Duplicato, recupero esistente...`);
          const { data: existing } = await this.supabase
            .from(table)
            .select('id')
            .eq('nome', trimmedNome)
            .single();

          if (existing) {
            console.log(`  ✅ FORCE - Recuperato ID esistente: ${existing.id}`);
            return existing.id;
          }
        }
        console.log(`  ❌ FORCE - Errore inserimento:`, error);
        this.log('error', `[FORCE] Errore inserimento in ${table}:`, error);
        return null;
      }

      console.log(`  ✅ FORCE - Creato nuovo ID: ${data.id}`);
      return data.id;
    } catch (err) {
      console.log(`  ❌ FORCE - Eccezione:`, err);
      this.log('error', `[FORCE] Eccezione in ${table}:`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Batch import di multiple URL
   */
  public async batchImport(
    urls: string[],
    batchSize = 5,
  ): Promise<ImportResult[]> {
    this.log(
      'log',
      `📦 Avvio batch import di ${urls.length} URL (batch size: ${batchSize})`,
    );

    const results: ImportResult[] = [];

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      this.log(
        'debug',
        `Elaborazione batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)}`,
      );

      const batchPromises = batch.map((url) => this.autoImport(url));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: `Promise rejection: ${result.reason}`,
          });
        }
      });

      // Pausa tra i batch
      if (i + batchSize < urls.length) {
        this.log('debug', `Pausa di 2 secondi tra i batch...`);
        await this.delay(2000);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    this.log(
      'log',
      `✅ Batch import completato: ${successCount}/${urls.length} successi`,
    );

    return results;
  }

  /**
   * Verifica se un URL è già stato importato
   */
  public async checkDuplicate(url: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('manga')
        .select('id')
        .eq('url_origine', url)
        .maybeSingle();

      if (error) {
        this.log('error', `Errore verifica duplicati`, {
          error: error.message,
          url,
        });
        return false;
      }

      return !!data;
    } catch (err) {
      this.log('error', `Eccezione verifica duplicati`, {
        error: err instanceof Error ? err.message : String(err),
        url,
      });
      return false;
    }
  }

  /**
   * Ottieni statistiche import
   */
  public async getImportStats(days = 30): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: false })
        .limit(days);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (err) {
      this.log('error', `Errore recupero statistiche`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // --- HELPERS CON CACHE ---
  private async getOrCreateMetadataId(
    table: string,
    nome: string,
  ): Promise<number | null> {
    if (!nome || !nome.trim()) return null;

    const trimmedNome = nome.trim();

    try {
      const { data, error } = await this.supabase
        .from(table)
        .upsert({ nome: trimmedNome }, { onConflict: 'nome' })
        .select('id')
        .single();

      if (error) {
        this.log('error', `Errore metadata ${table}`, {
          error: error.message,
          nome: trimmedNome,
        });
        return null;
      }

      return data?.id ?? null;
    } catch (err) {
      this.log('error', `Eccezione metadata ${table}`, {
        error: err instanceof Error ? err.message : String(err),
        nome: trimmedNome,
      });
      return null;
    }
  }

  private async getOrCreateMetadataIdCached(
    table: string,
    nome: string,
  ): Promise<number | null> {
    if (!nome || !nome.trim()) return null;

    const trimmedNome = nome.trim();
    const cacheKey = `${table}:${trimmedNome}`;

    // Controlla cache
    const cached = this.metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Non in cache, ottieni dal DB
    const result = await this.getOrCreateMetadataId(table, trimmedNome);

    // Salva in cache
    this.metadataCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  }

  private async updateCounter(
    table: string,
    pivotTable: string,
    recordId: number,
  ): Promise<void> {
    try {
      const pivotColumn = this.getPivotColumn(table);

      const { count, error: countError } = await this.supabase
        .from(pivotTable)
        .select('*', { count: 'exact', head: true })
        .eq(pivotColumn, recordId);

      if (countError) {
        throw countError;
      }

      const { error: updateError } = await this.supabase
        .from(table)
        .update({ counter: count || 0 })
        .eq('id', recordId);

      if (updateError) {
        throw updateError;
      }
    } catch (err) {
      this.log('error', `Errore aggiornamento counter`, {
        error: err instanceof Error ? err.message : String(err),
        table,
        recordId,
      });
    }
  }

  /**
   * Invalida cache per un manga specifico
   */
  private invalidateMangaCache(mangaId: number): void {
    // Implementa se necessario
    this.log('debug', `Cache invalidata per manga ${mangaId}`);
  }

  /**
   * Clear metadata cache
   */
  public clearMetadataCache(): void {
    this.metadataCache.clear();
    this.log('debug', 'Metadata cache cleared');
  }

  /**
   * Get all manga for admin (usa 'manga' come da schema)
   */
  public async getAllMangaAdmin(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('manga')
        .select(
          `
          *,
          artisti!left(nome),
          categorie!left(nome)
        `,
        )
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (err) {
      this.log('error', `Errore recupero manga`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Get manga by ID con tutti i metadata
   */
  public async getMangaById(id: number): Promise<MangaWithRelations | null> {
    try {
      const { data, error } = await this.supabase
        .from('manga')
        .select(
          `
          *,
          artisti!left(nome),
          categorie!left(nome),
          manga_tags (
            tags ( id, nome )
          ),
          manga_characters (
            characters ( id, nome )
          ),
          manga_parodies (
            parodies ( id, nome )
          ),
          manga_gruppi (
            gruppi ( id, nome )
          )
        `,
        )
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (!data) return null;

      const typedData = data as unknown as MangaWithRelationsRaw;

      // Trasforma i dati per avere array piatti di oggetti
      const transformed: MangaWithRelations = {
        id: typedData.id,
        titolo: typedData.titolo,
        immagine: typedData.immagine,
        lingua: typedData.lingua || 'Italiano',
        numero_pagine: typedData.numero_pagine,
        created_at: typedData.created_at,
        url_origine: typedData.url_origine,
        pagine: typedData.pagine,
        visible: typedData.visible || false,
        categoria_id: typedData.categoria_id,
        artista_id: typedData.artista_id,
        artisti: typedData.artisti,
        categorie: typedData.categorie,
        tags: typedData.manga_tags?.map((mt) => mt.tags) || [],
        characters:
          typedData.manga_characters?.map((mc) => mc.characters) || [],
        parodies: typedData.manga_parodies?.map((mp) => mp.parodies) || [],
        gruppi: typedData.manga_gruppi?.map((mg) => mg.gruppi) || [],
      };

      return transformed;
    } catch (err) {
      this.logger.error(`Errore recupero manga ${id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Get all manga for home page with transformed tags (like getMangaById)
   */
  public async getAllMangaForHome(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('manga')
        .select(
          `
          *,
          artisti!left(nome),
          categorie!left(nome),
          manga_tags (
            tags ( id, nome )
          )
        `,
        )
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (!data) return [];

      // Trasforma i dati come nel getMangaById
      const transformed = data.map((item) => {
        // Prima trasforma i tags in array piatto
        const tags = item.manga_tags
          ?.map((mt: any) => mt.tags)
          .filter(Boolean) || [];

        // Crea un nuovo oggetto senza i campi annidati
        const { manga_tags, ...rest } = item;

        return {
          ...rest,
          tags: tags, // Ora tags è un array piatto come nel reader
        };
      });

      return transformed;
    } catch (err) {
      this.logger.error(`Errore recupero manga per home`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Aggiorna visibilità manga
   */
  public async updateMangaVisibility(
    id: number,
    visible: boolean,
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('manga')
        .update({ visible })
        .eq('id', id);

      if (error) {
        throw error;
      }

      this.log('log', `Visibilità manga ${id} aggiornata a ${visible}`);
      return true;
    } catch (err) {
      this.log('error', `Errore aggiornamento visibilità ${id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Ottieni tutti gli artisti
   */
  public async getAllArtisti(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('artisti')
        .select('*')
        .order('nome');

      if (error) throw error;
      return data || [];
    } catch (err) {
      this.log('error', 'Errore recupero artisti', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Ottieni tutte le categorie
   */
  public async getAllCategorie(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('categorie')
        .select('*')
        .order('nome');

      if (error) throw error;
      return data || [];
    } catch (err) {
      this.log('error', 'Errore recupero categorie', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}