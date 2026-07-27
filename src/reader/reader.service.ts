import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================
// INTERFACCE DI OUTPUT
// ============================================

export interface VoteData {
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
}

export interface ReadingProgress {
  mangaId: number;
  currentPage: number;
  totalPages: number;
  progress: number; // percentuale 0-100
  lastRead: Date;
}

export interface MangaDetails {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string;
  numero_pagine: number | null;
  pagine: string[];
  artista: string | null;
  categorie: string | null;
  up_votes: number;
  down_votes: number;
}

// ============================================
// INTERFACCE PER I TIPI DI RISPOSTA DA SUPABASE
// ============================================

interface MangaResponse {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string;
  numero_pagine: number | null;
  pagine: unknown;
  up_votes: number;
  down_votes: number;
  artisti: { nome: string } | { nome: string }[] | null;
  categorie: { nome: string } | { nome: string }[] | null;
}

interface VoteResponse {
  id: number;
  vote_type: string;
}

interface BookmarkResponse {
  id: number;
  last_page: number;
  updated_at: string;
}

@Injectable()
export class ReaderService {
  private readonly logger = new Logger(ReaderService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Ottieni i dettagli di un manga per la lettura
   */
  async getMangaForReading(mangaId: number): Promise<MangaDetails | null> {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('manga')
        .select(
          `
          id,
          titolo,
          immagine,
          lingua,
          numero_pagine,
          pagine,
          up_votes,
          down_votes,
          artisti!manga_artista_id_fkey (nome),
          categorie!manga_categoria_id_fkey (nome)
        `,
        )
        .eq('id', mangaId)
        .single();

      if (error) {
        this.logger.error(`Error fetching manga ${mangaId}:`, error);
        return null;
      }

      if (!data) return null;

      // Tipizzazione sicura del risultato
      const mangaData = data as unknown as MangaResponse;

      // Estrai artista in modo sicuro
      let artista: string | null = null;
      if (mangaData.artisti) {
        if (Array.isArray(mangaData.artisti)) {
          artista = mangaData.artisti[0]?.nome || null;
        } else {
          artista = mangaData.artisti.nome;
        }
      }

      // Estrai categoria in modo sicuro
      let categorie: string | null = null;
      if (mangaData.categorie) {
        if (Array.isArray(mangaData.categorie)) {
          categorie = mangaData.categorie[0]?.nome || null;
        } else {
          categorie = mangaData.categorie.nome;
        }
      }

      // Gestisci pagine in modo sicuro
      let pagine: string[] = [];
      if (Array.isArray(mangaData.pagine)) {
        pagine = mangaData.pagine.filter(
          (item): item is string => typeof item === 'string',
        );
      }

      const mangaDetails: MangaDetails = {
        id: mangaData.id,
        titolo: mangaData.titolo,
        immagine: mangaData.immagine,
        lingua: mangaData.lingua,
        numero_pagine: mangaData.numero_pagine,
        pagine,
        artista,
        categorie,
        up_votes: mangaData.up_votes || 0,
        down_votes: mangaData.down_votes || 0,
      };

      return mangaDetails;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Unexpected error fetching manga ${mangaId}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Ottieni lo stato dei voti per un manga e l'utente corrente
   */
  async getVoteStatus(mangaId: number, userWallet?: string): Promise<VoteData> {
    try {
      // 1. Ottieni i totali dal manga
      const { data: manga, error: mangaError } =
        await this.supabaseService.supabase
          .from('manga')
          .select('up_votes, down_votes')
          .eq('id', mangaId)
          .single();

      if (mangaError) {
        this.logger.error(`Error fetching manga votes: ${mangaError.message}`);
        return { upvotes: 0, downvotes: 0, userVote: null };
      }

      // Cast sicuro dei dati manga
      const mangaData = manga as {
        up_votes: number;
        down_votes: number;
      } | null;

      // 2. Se utente loggato, controlla il suo voto
      let userVote: 'up' | 'down' | null = null;

      if (userWallet) {
        const { data: vote, error: voteError } =
          await this.supabaseService.supabase
            .from('votes')
            .select('vote_type')
            .eq('manga_id', mangaId)
            .eq('user_wallet', userWallet.toLowerCase())
            .maybeSingle();

        if (!voteError && vote) {
          const voteData = vote as { vote_type: string };
          if (voteData.vote_type === 'up' || voteData.vote_type === 'down') {
            userVote = voteData.vote_type as 'up' | 'down';
          }
        }
      }

      return {
        upvotes: mangaData?.up_votes || 0,
        downvotes: mangaData?.down_votes || 0,
        userVote,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting vote status: ${errorMessage}`);
      return { upvotes: 0, downvotes: 0, userVote: null };
    }
  }

  /**
   * Vota o cambia voto per un manga
   */
  async vote(
    mangaId: number,
    userWallet: string,
    voteType: 'up' | 'down',
  ): Promise<VoteData> {
    try {
      // Validazione input
      if (!userWallet || !mangaId || !voteType) {
        throw new Error('Missing required parameters');
      }

      const normalizedWallet = userWallet.toLowerCase();

      // 1. Verifica se l'utente ha già votato
      const { data: existingVote, error: findError } =
        await this.supabaseService.supabase
          .from('votes')
          .select('*')
          .eq('manga_id', mangaId)
          .eq('user_wallet', normalizedWallet)
          .maybeSingle();

      if (findError) {
        this.logger.error(`Error finding existing vote: ${findError.message}`);
        throw findError;
      }

      // Cast sicuro del voto esistente
      const existingVoteData = existingVote as VoteResponse | null;

      if (!existingVoteData) {
        // CASO 1: Nuovo voto
        await this.createNewVote(mangaId, normalizedWallet, voteType);
      } else if (existingVoteData.vote_type !== voteType) {
        // CASO 2: Cambio voto
        await this.changeVote(
          existingVoteData.id,
          mangaId,
          existingVoteData.vote_type as 'up' | 'down',
          voteType,
        );
      } else {
        // CASO 3: Stesso voto - rimuovi (toggle off)
        await this.removeExistingVote(existingVoteData.id, mangaId, voteType);
      }

      // 3. Ritorna lo stato aggiornato
      return this.getVoteStatus(mangaId, normalizedWallet);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error voting: ${errorMessage}`);
      throw new Error('Failed to vote');
    }
  }

  /**
   * Crea un nuovo voto
   */
  private async createNewVote(
    mangaId: number,
    userWallet: string,
    voteType: 'up' | 'down',
  ): Promise<void> {
    try {
      // Inserisci il voto
      const insertData = {
        user_wallet: userWallet,
        manga_id: mangaId,
        vote_type: voteType,
      };

      const { error: insertError } = await this.supabaseService.supabase
        .from('votes')
        .insert(insertData as never);

      if (insertError) {
        this.logger.error(`Error inserting vote: ${insertError.message}`);
        throw insertError;
      }

      // Aggiorna il contatore nel manga
      const incrementField = voteType === 'up' ? 'up_votes' : 'down_votes';
      const updateData = {
        [incrementField]: this.supabaseService.supabase.rpc('increment', {
          amount: 1,
        } as never),
      };

      const { error: updateError } = await this.supabaseService.supabase
        .from('manga')
        .update(updateData as never)
        .eq('id', mangaId);

      if (updateError) {
        this.logger.error(`Error updating manga votes: ${updateError.message}`);
        throw updateError;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error in createNewVote: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Cambia un voto esistente (da up a down o viceversa)
   */
  private async changeVote(
    voteId: number,
    mangaId: number,
    oldVoteType: 'up' | 'down',
    newVoteType: 'up' | 'down',
  ): Promise<void> {
    try {
      // Aggiorna il voto
      const updateVoteData = {
        vote_type: newVoteType,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await this.supabaseService.supabase
        .from('votes')
        .update(updateVoteData as never)
        .eq('id', voteId);

      if (updateError) {
        this.logger.error(`Error updating vote: ${updateError.message}`);
        throw updateError;
      }

      // Aggiorna i totali nel manga
      if (oldVoteType === 'up' && newVoteType === 'down') {
        // Era up, diventa down
        const updateData = {
          up_votes: this.supabaseService.supabase.rpc('decrement', {
            amount: 1,
          } as never),
          down_votes: this.supabaseService.supabase.rpc('increment', {
            amount: 1,
          } as never),
        };

        const { error: mangaError } = await this.supabaseService.supabase
          .from('manga')
          .update(updateData as never)
          .eq('id', mangaId);

        if (mangaError) throw mangaError;
      } else if (oldVoteType === 'down' && newVoteType === 'up') {
        // Era down, diventa up
        const updateData = {
          up_votes: this.supabaseService.supabase.rpc('increment', {
            amount: 1,
          } as never),
          down_votes: this.supabaseService.supabase.rpc('decrement', {
            amount: 1,
          } as never),
        };

        const { error: mangaError } = await this.supabaseService.supabase
          .from('manga')
          .update(updateData as never)
          .eq('id', mangaId);

        if (mangaError) throw mangaError;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error in changeVote: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Rimuovi un voto esistente (toggle off)
   */
  private async removeExistingVote(
    voteId: number,
    mangaId: number,
    voteType: 'up' | 'down',
  ): Promise<void> {
    try {
      // Elimina il voto
      const { error: deleteError } = await this.supabaseService.supabase
        .from('votes')
        .delete()
        .eq('id', voteId);

      if (deleteError) {
        this.logger.error(`Error deleting vote: ${deleteError.message}`);
        throw deleteError;
      }

      // Decrementa il contatore appropriato
      const decrementField = voteType === 'up' ? 'up_votes' : 'down_votes';
      const updateData = {
        [decrementField]: this.supabaseService.supabase.rpc('decrement', {
          amount: 1,
        } as never),
      };

      const { error: updateError } = await this.supabaseService.supabase
        .from('manga')
        .update(updateData as never)
        .eq('id', mangaId);

      if (updateError) {
        this.logger.error(`Error updating manga votes: ${updateError.message}`);
        throw updateError;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error in removeExistingVote: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Rimuovi voto (metodo pubblico alternativo)
   */
  async removeVote(mangaId: number, userWallet: string): Promise<VoteData> {
    try {
      const normalizedWallet = userWallet.toLowerCase();

      const { data: vote, error: findError } =
        await this.supabaseService.supabase
          .from('votes')
          .select('*')
          .eq('manga_id', mangaId)
          .eq('user_wallet', normalizedWallet)
          .maybeSingle();

      if (findError || !vote) {
        return this.getVoteStatus(mangaId, normalizedWallet);
      }

      const voteData = vote as VoteResponse;
      await this.removeExistingVote(
        voteData.id,
        mangaId,
        voteData.vote_type as 'up' | 'down',
      );

      return this.getVoteStatus(mangaId, normalizedWallet);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error removing vote: ${errorMessage}`);
      throw new Error('Failed to remove vote');
    }
  }

  /**
   * Salva il progresso di lettura
   */
  async saveReadingProgress(
    userWallet: string,
    mangaId: number,
    page: number,
    totalPages: number,
  ): Promise<ReadingProgress | null> {
    try {
      const normalizedWallet = userWallet.toLowerCase();
      const progress = Math.min(100, Math.round((page / totalPages) * 100));

      // Verifica se esiste già un bookmark
      const { data: existing, error: findError } =
        await this.supabaseService.supabase
          .from('bookmarks')
          .select('id')
          .eq('user_wallet', normalizedWallet)
          .eq('manga_id', mangaId)
          .maybeSingle();

      if (findError) {
        this.logger.error(`Error finding bookmark: ${findError.message}`);
        return null;
      }

      const now = new Date().toISOString();

      if (existing) {
        // Aggiorna bookmark esistente
        const existingData = existing as { id: number };
        const updateData = {
          last_page: page,
          updated_at: now,
          status: progress === 100 ? 'completed' : 'reading',
        };

        const { error: updateError } = await this.supabaseService.supabase
          .from('bookmarks')
          .update(updateData as never)
          .eq('id', existingData.id);

        if (updateError) {
          this.logger.error(`Error updating bookmark: ${updateError.message}`);
          return null;
        }
      } else {
        // Crea nuovo bookmark
        const insertData = {
          user_wallet: normalizedWallet,
          manga_id: mangaId,
          last_page: page,
          status: progress === 100 ? 'completed' : 'reading',
        };

        const { error: insertError } = await this.supabaseService.supabase
          .from('bookmarks')
          .insert(insertData as never);

        if (insertError) {
          this.logger.error(`Error creating bookmark: ${insertError.message}`);
          return null;
        }
      }

      return {
        mangaId,
        currentPage: page,
        totalPages,
        progress,
        lastRead: new Date(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error saving reading progress: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Ottieni il progresso di lettura per un utente
   */
  async getReadingProgress(
    userWallet: string,
    mangaId: number,
  ): Promise<ReadingProgress | null> {
    try {
      const normalizedWallet = userWallet.toLowerCase();

      const { data: bookmark, error } = await this.supabaseService.supabase
        .from('bookmarks')
        .select('last_page, updated_at')
        .eq('user_wallet', normalizedWallet)
        .eq('manga_id', mangaId)
        .maybeSingle();

      if (error || !bookmark) {
        return null;
      }

      const bookmarkData = bookmark as BookmarkResponse;

      // Ottieni il totale delle pagine dal manga
      const { data: manga, error: mangaError } =
        await this.supabaseService.supabase
          .from('manga')
          .select('numero_pagine')
          .eq('id', mangaId)
          .single();

      if (mangaError || !manga) {
        return null;
      }

      const mangaData = manga as { numero_pagine: number | null };
      const totalPages = mangaData.numero_pagine || 1;
      const progress = Math.min(
        100,
        Math.round((bookmarkData.last_page / totalPages) * 100),
      );

      return {
        mangaId,
        currentPage: bookmarkData.last_page,
        totalPages,
        progress,
        lastRead: new Date(bookmarkData.updated_at),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting reading progress: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Ottieni la lista dei bookmark dell'utente
   */
  async getUserBookmarks(userWallet: string): Promise<any[]> {
    try {
      const normalizedWallet = userWallet.toLowerCase();

      const { data, error } = await this.supabaseService.supabase
        .from('bookmarks')
        .select(
          `
          id,
          last_page,
          status,
          added_at,
          updated_at,
          manga!bookmarks_manga_id_fkey (
            id,
            titolo,
            immagine,
            numero_pagine,
            up_votes,
            down_votes
          )
        `,
        )
        .eq('user_wallet', normalizedWallet)
        .order('updated_at', { ascending: false });

      if (error) {
        this.logger.error(`Error fetching bookmarks: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting user bookmarks: ${errorMessage}`);
      return [];
    }
  }
}
