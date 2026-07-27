import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface CommentResponse {
  id: number;
  manga_id: number;
  user_wallet: string;
  parent_id: number | null;
  content: string;
  mentioned_manga_ids: number[];
  mentioned_manga?: any[];
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  up_votes: number;
  down_votes: number;
  user_vote?: 'up' | 'down' | null;
  replies?: CommentResponse[];
  reply_count?: number;
}

// Interfacce per le risposte tipizzate da Supabase
interface CommentRow {
  id: number;
  manga_id: number;
  user_wallet: string;
  parent_id: number | null;
  content: string;
  mentioned_manga_ids: number[];
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  up_votes: number;
  down_votes: number;
}

interface VoteRow {
  id: number;
  comment_id: number;
  user_wallet: string;
  vote_type: 'up' | 'down';
}

@Controller('comments')
export class CommentsController {
  private readonly logger = new Logger(CommentsController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /comments/manga/:mangaId
   * Ottieni tutti i commenti per un manga (con paginazione)
   */
  @Get('manga/:mangaId')
  async getComments(
    @Param('mangaId') mangaId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Headers('x-wallet') wallet?: string,
  ): Promise<{ comments: CommentResponse[]; total: number }> {
    const mangaIdNum = parseInt(mangaId, 10);
    if (isNaN(mangaIdNum)) {
      throw new HttpException('ID manga non valido', HttpStatus.BAD_REQUEST);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    const client = this.supabaseService.supabase;

    try {
      // Ottieni commenti principali (parent_id IS NULL)
      const {
        data: comments,
        error,
        count,
      } = await client
        .from('comments')
        .select('*', { count: 'exact' })
        .eq('manga_id', mangaIdNum)
        .is('parent_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      // Per ogni commento, ottieni il conteggio delle risposte
      const commentsWithDetails = await Promise.all(
        ((comments as CommentRow[]) || []).map(async (comment) => {
          // Conteggio risposte
          const { count: replyCount } = await client
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('parent_id', comment.id)
            .eq('is_deleted', false);

          // Voto dell'utente (se wallet fornito)
          let userVote: 'up' | 'down' | null = null;
          if (wallet) {
            const { data: vote } = await client
              .from('comment_votes')
              .select('vote_type')
              .eq('comment_id', comment.id)
              .eq('user_wallet', wallet.toLowerCase())
              .maybeSingle();

            if (vote) {
              const voteData = vote as { vote_type: string };
              if (
                voteData.vote_type === 'up' ||
                voteData.vote_type === 'down'
              ) {
                userVote = voteData.vote_type as 'up' | 'down';
              }
            }
          }

          // Dettagli manga menzionati
          const mentionedManga = comment.mentioned_manga_ids?.length
            ? await this.getMangaDetails(comment.mentioned_manga_ids)
            : [];

          return {
            ...comment,
            user_vote: userVote,
            reply_count: replyCount || 0,
            mentioned_manga: mentionedManga,
          } as CommentResponse;
        }),
      );

      return {
        comments: commentsWithDetails,
        total: count || 0,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero commenti: ${errorMessage}`);
      throw new HttpException(
        'Errore server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /comments/:commentId/replies
   * Ottieni le risposte a un commento
   */
  @Get(':commentId/replies')
  async getReplies(
    @Param('commentId') commentId: string,
    @Headers('x-wallet') wallet?: string,
  ): Promise<CommentResponse[]> {
    const commentIdNum = parseInt(commentId, 10);
    if (isNaN(commentIdNum)) {
      throw new HttpException('ID commento non valido', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;

    try {
      const { data: replies, error } = await client
        .from('comments')
        .select('*')
        .eq('parent_id', commentIdNum)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Aggiungi info voto per ogni risposta
      const repliesWithVotes = await Promise.all(
        ((replies as CommentRow[]) || []).map(async (reply) => {
          let userVote: 'up' | 'down' | null = null;
          if (wallet) {
            const { data: vote } = await client
              .from('comment_votes')
              .select('vote_type')
              .eq('comment_id', reply.id)
              .eq('user_wallet', wallet.toLowerCase())
              .maybeSingle();

            if (vote) {
              const voteData = vote as { vote_type: string };
              if (
                voteData.vote_type === 'up' ||
                voteData.vote_type === 'down'
              ) {
                userVote = voteData.vote_type as 'up' | 'down';
              }
            }
          }

          const mentionedManga = reply.mentioned_manga_ids?.length
            ? await this.getMangaDetails(reply.mentioned_manga_ids)
            : [];

          return {
            ...reply,
            user_vote: userVote,
            mentioned_manga: mentionedManga,
          } as CommentResponse;
        }),
      );

      return repliesWithVotes;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero risposte: ${errorMessage}`);
      throw new HttpException(
        'Errore server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /comments
   * Crea un nuovo commento
   */
  @Post()
  async createComment(
    @Body()
    body: {
      manga_id: number;
      content: string;
      parent_id?: number;
      mentioned_manga_ids?: number[];
    },
    @Headers('x-wallet') wallet: string,
  ): Promise<CommentResponse> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    if (!body.manga_id || !body.content?.trim()) {
      throw new HttpException('Dati incompleti', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      // Verifica che il manga esista
      const { data: manga, error: mangaError } = await client
        .from('manga')
        .select('id')
        .eq('id', body.manga_id)
        .single();

      if (mangaError || !manga) {
        throw new HttpException('Manga non trovato', HttpStatus.NOT_FOUND);
      }

      // Se è una risposta, verifica che il commento padre esista
      if (body.parent_id) {
        const { data: parent, error: parentError } = await client
          .from('comments')
          .select('id')
          .eq('id', body.parent_id)
          .single();

        if (parentError || !parent) {
          throw new HttpException(
            'Commento padre non trovato',
            HttpStatus.NOT_FOUND,
          );
        }
      }

      const insertData = {
        manga_id: body.manga_id,
        user_wallet: normalizedWallet,
        parent_id: body.parent_id || null,
        content: body.content.trim(),
        mentioned_manga_ids: body.mentioned_manga_ids || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('comments')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;

      // Traccia evento analytics
      await this.trackCommentEvent(body.manga_id, normalizedWallet, 'create');

      return data as CommentResponse;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore creazione commento: ${errorMessage}`);
      throw new HttpException(
        'Errore server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /comments/:id
   * Modifica un commento esistente
   */
  @Put(':id')
  async updateComment(
    @Param('id') id: string,
    @Body('content') content: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<CommentResponse> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const commentId = parseInt(id, 10);
    if (isNaN(commentId)) {
      throw new HttpException('ID commento non valido', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      // Verifica proprietà del commento
      const { data: existing, error: findError } = await client
        .from('comments')
        .select('user_wallet')
        .eq('id', commentId)
        .single();

      if (findError || !existing) {
        throw new HttpException('Commento non trovato', HttpStatus.NOT_FOUND);
      }

      const existingData = existing as { user_wallet: string };

      if (existingData.user_wallet !== normalizedWallet) {
        throw new HttpException('Non autorizzato', HttpStatus.FORBIDDEN);
      }

      const updateData = {
        content: content.trim(),
        is_edited: true,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('comments')
        .update(updateData as never)
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;

      return data as CommentResponse;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore modifica commento: ${errorMessage}`);
      throw new HttpException(
        'Errore server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /comments/:id
   * Elimina un commento (soft delete)
   */
  @Delete(':id')
  async deleteComment(
    @Param('id') id: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<{ success: boolean }> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const commentId = parseInt(id, 10);
    if (isNaN(commentId)) {
      throw new HttpException('ID commento non valido', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      // Verifica proprietà
      const { data: existing, error: findError } = await client
        .from('comments')
        .select('user_wallet, manga_id')
        .eq('id', commentId)
        .single();

      if (findError || !existing) {
        throw new HttpException('Commento non trovato', HttpStatus.NOT_FOUND);
      }

      const existingData = existing as {
        user_wallet: string;
        manga_id: number;
      };

      if (existingData.user_wallet !== normalizedWallet) {
        throw new HttpException('Non autorizzato', HttpStatus.FORBIDDEN);
      }

      const updateData = { is_deleted: true };

      const { error } = await client
        .from('comments')
        .update(updateData as never)
        .eq('id', commentId);

      if (error) throw error;

      await this.trackCommentEvent(
        existingData.manga_id,
        normalizedWallet,
        'delete',
      );

      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore eliminazione commento: ${errorMessage}`);
      throw new HttpException(
        'Errore server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /comments/:id/vote
   * Vota un commento
   */
  @Post(':id/vote')
  async voteComment(
    @Param('id') id: string,
    @Body('voteType') voteType: 'up' | 'down',
    @Headers('x-wallet') wallet: string,
  ): Promise<{
    up_votes: number;
    down_votes: number;
    user_vote: string | null;
  }> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const commentId = parseInt(id, 10);
    if (isNaN(commentId)) {
      throw new HttpException('ID commento non valido', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      // Verifica se l'utente ha già votato
      const { data: existingVote, error: findError } = await client
        .from('comment_votes')
        .select('*')
        .eq('comment_id', commentId)
        .eq('user_wallet', normalizedWallet)
        .maybeSingle();

      if (findError) throw findError;

      const existingVoteData = existingVote as VoteRow | null;

      if (!existingVoteData) {
        // Nuovo voto
        const insertData = {
          comment_id: commentId,
          user_wallet: normalizedWallet,
          vote_type: voteType,
        };
        await client.from('comment_votes').insert(insertData as never);

        // Aggiorna contatori
        const updateData = {
          [voteType === 'up' ? 'up_votes' : 'down_votes']: client.rpc(
            'increment',
            { amount: 1 } as never,
          ),
        };
        await client
          .from('comments')
          .update(updateData as never)
          .eq('id', commentId);
      } else if (existingVoteData.vote_type !== voteType) {
        // Cambio voto
        const updateVoteData = { vote_type: voteType };
        await client
          .from('comment_votes')
          .update(updateVoteData as never)
          .eq('id', existingVoteData.id);

        // Aggiorna contatori
        if (existingVoteData.vote_type === 'up' && voteType === 'down') {
          const updateData = {
            up_votes: client.rpc('decrement', { amount: 1 } as never),
            down_votes: client.rpc('increment', { amount: 1 } as never),
          };
          await client
            .from('comments')
            .update(updateData as never)
            .eq('id', commentId);
        } else {
          const updateData = {
            up_votes: client.rpc('increment', { amount: 1 } as never),
            down_votes: client.rpc('decrement', { amount: 1 } as never),
          };
          await client
            .from('comments')
            .update(updateData as never)
            .eq('id', commentId);
        }
      } else {
        // Rimuovi voto
        await client
          .from('comment_votes')
          .delete()
          .eq('id', existingVoteData.id);

        const updateData = {
          [voteType === 'up' ? 'up_votes' : 'down_votes']: client.rpc(
            'decrement',
            { amount: 1 } as never,
          ),
        };
        await client
          .from('comments')
          .update(updateData as never)
          .eq('id', commentId);
      }

      // Ottieni stato aggiornato
      const { data: comment, error: commentError } = await client
        .from('comments')
        .select('up_votes, down_votes')
        .eq('id', commentId)
        .single();

      if (commentError) throw commentError;

      const commentData = comment as { up_votes: number; down_votes: number };

      return {
        up_votes: commentData?.up_votes || 0,
        down_votes: commentData?.down_votes || 0,
        user_vote: voteType,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore voto commento: ${errorMessage}`);
      throw new HttpException(
        'Errore server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /comments/search-manga?q=...
   * Cerca manga per menzioni @
   */
  @Get('search-manga')
  async searchManga(
    @Query('q') query: string,
    @Query('limit') limit: string = '10',
  ): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const limitNum = parseInt(limit, 10);
    const client = this.supabaseService.supabase;

    try {
      const { data, error } = await client
        .from('manga')
        .select('id, titolo, immagine')
        .ilike('titolo', `%${query}%`)
        .eq('visible', true)
        .order('titolo')
        .limit(limitNum);

      if (error) throw error;

      return (data as any[]) || [];
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore ricerca manga: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Helper per ottenere dettagli manga menzionati
   */
  private async getMangaDetails(ids: number[]): Promise<any[]> {
    if (!ids?.length) return [];

    const client = this.supabaseService.supabase;

    try {
      const { data } = await client
        .from('manga')
        .select('id, titolo, immagine')
        .in('id', ids);

      return (data as any[]) || [];
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero dettagli manga: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Traccia eventi commenti per analytics
   */
  private async trackCommentEvent(
    mangaId: number,
    wallet: string,
    action: string,
  ): Promise<void> {
    try {
      const insertData = {
        manga_id: mangaId,
        event_type: `comment_${action}`,
        wallet_address: wallet,
        created_at: new Date().toISOString(),
      };
      await this.supabaseService.supabase
        .from('analytics_events')
        .insert(insertData as never);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.debug(`Errore tracking commento: ${errorMessage}`);
    }
  }
}
