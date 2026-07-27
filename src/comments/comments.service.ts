import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================
// INTERFACCE DI OUTPUT
// ============================================

export interface CommentResponse {
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
  reply_count?: number;
}

export interface CreateCommentDto {
  manga_id: number;
  content: string;
  parent_id?: number;
  mentioned_manga_ids?: number[];
}

export interface VoteCommentDto {
  commentId: number;
  voteType: 'up' | 'down';
}

// ============================================
// INTERFACCE PER TIPIZZARE I DATI DA SUPABASE
// ============================================

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
  is_deleted?: boolean;
}

interface VoteRow {
  id: number;
  comment_id: number;
  user_wallet: string;
  vote_type: 'up' | 'down';
}

interface MangaRow {
  id: number;
  titolo: string;
  immagine: string | null;
}

interface CommentVoteResult {
  up_votes: number;
  down_votes: number;
}

interface ExistingComment {
  user_wallet: string;
  manga_id: number;
}

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Ottieni commenti per un manga
   */
  async getComments(
    mangaId: number,
    page: number = 1,
    limit: number = 20,
    wallet?: string,
  ): Promise<{ comments: CommentResponse[]; total: number }> {
    const offset = (page - 1) * limit;
    const client = this.supabaseService.supabase;

    try {
      const {
        data: comments,
        error,
        count,
      } = await client
        .from('comments')
        .select('*', { count: 'exact' })
        .eq('manga_id', mangaId)
        .is('parent_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const commentsWithDetails = await Promise.all(
        ((comments as CommentRow[]) || []).map(async (comment) => {
          const replyCount = await this.getReplyCount(comment.id);
          const userVote = wallet
            ? await this.getUserVote(comment.id, wallet)
            : null;
          const mentionedManga = await this.getMangaDetails(
            comment.mentioned_manga_ids || [],
          );

          return {
            ...comment,
            user_vote: userVote,
            reply_count: replyCount,
            mentioned_manga: mentionedManga,
          } as CommentResponse;
        }),
      );

      return {
        comments: commentsWithDetails,
        total: count || 0,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting comments: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Ottieni risposte a un commento
   */
  async getReplies(
    commentId: number,
    wallet?: string,
  ): Promise<CommentResponse[]> {
    const client = this.supabaseService.supabase;

    try {
      const { data: replies, error } = await client
        .from('comments')
        .select('*')
        .eq('parent_id', commentId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const repliesWithDetails = await Promise.all(
        ((replies as CommentRow[]) || []).map(async (reply) => {
          const userVote = wallet
            ? await this.getUserVote(reply.id, wallet)
            : null;
          const mentionedManga = await this.getMangaDetails(
            reply.mentioned_manga_ids || [],
          );

          return {
            ...reply,
            user_vote: userVote,
            mentioned_manga: mentionedManga,
          } as CommentResponse;
        }),
      );

      return repliesWithDetails;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting replies: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Crea un nuovo commento
   */
  async createComment(
    data: CreateCommentDto,
    wallet: string,
  ): Promise<CommentResponse> {
    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      const insertData = {
        manga_id: data.manga_id,
        user_wallet: normalizedWallet,
        parent_id: data.parent_id || null,
        content: data.content.trim(),
        mentioned_manga_ids: data.mentioned_manga_ids || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: comment, error } = await client
        .from('comments')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;

      await this.trackCommentEvent(data.manga_id, normalizedWallet, 'create');

      return comment as CommentResponse;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error creating comment: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Aggiorna un commento
   */
  async updateComment(
    id: number,
    content: string,
    wallet: string,
  ): Promise<CommentResponse> {
    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      const { data: existing, error: findError } = await client
        .from('comments')
        .select('user_wallet')
        .eq('id', id)
        .single();

      if (findError || !existing) throw new Error('Comment not found');

      const existingData = existing as unknown as { user_wallet: string };

      if (existingData.user_wallet !== normalizedWallet)
        throw new Error('Unauthorized');

      const updateData = {
        content: content.trim(),
        is_edited: true,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('comments')
        .update(updateData as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CommentResponse;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error updating comment: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Elimina un commento (soft delete)
   */
  async deleteComment(id: number, wallet: string): Promise<boolean> {
    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      const { data: existing, error: findError } = await client
        .from('comments')
        .select('user_wallet, manga_id')
        .eq('id', id)
        .single();

      if (findError || !existing) throw new Error('Comment not found');

      const existingData = existing as unknown as ExistingComment;

      if (existingData.user_wallet !== normalizedWallet)
        throw new Error('Unauthorized');

      const updateData = { is_deleted: true };

      const { error } = await client
        .from('comments')
        .update(updateData as never)
        .eq('id', id);

      if (error) throw error;

      await this.trackCommentEvent(
        existingData.manga_id,
        normalizedWallet,
        'delete',
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error deleting comment: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Vota un commento
   */
  async voteComment(
    commentId: number,
    voteType: 'up' | 'down',
    wallet: string,
  ): Promise<{
    up_votes: number;
    down_votes: number;
    user_vote: string | null;
  }> {
    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      const { data: existingVote, error: findError } = await client
        .from('comment_votes')
        .select('*')
        .eq('comment_id', commentId)
        .eq('user_wallet', normalizedWallet)
        .maybeSingle();

      if (findError) throw findError;

      const existingVoteData = existingVote as unknown as VoteRow | null;

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

      const commentData = comment as unknown as CommentVoteResult;

      return {
        up_votes: commentData?.up_votes || 0,
        down_votes: commentData?.down_votes || 0,
        user_vote: voteType,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error voting comment: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Cerca manga per menzioni
   */
  async searchManga(query: string, limit: number = 10): Promise<any[]> {
    const client = this.supabaseService.supabase;

    try {
      const { data, error } = await client
        .from('manga')
        .select('id, titolo, immagine')
        .ilike('titolo', `%${query}%`)
        .eq('visible', true)
        .order('titolo')
        .limit(limit);

      if (error) throw error;
      return (data as MangaRow[]) || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error searching manga: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Ottieni dettagli manga menzionati
   */
  private async getMangaDetails(ids: number[]): Promise<any[]> {
    if (!ids?.length) return [];

    const client = this.supabaseService.supabase;

    try {
      const { data } = await client
        .from('manga')
        .select('id, titolo, immagine')
        .in('id', ids);

      return (data as MangaRow[]) || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting manga details: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Ottieni conteggio risposte
   */
  private async getReplyCount(commentId: number): Promise<number> {
    const client = this.supabaseService.supabase;

    try {
      const { count } = await client
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', commentId)
        .eq('is_deleted', false);

      return count || 0;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting reply count: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Ottieni voto utente
   */
  private async getUserVote(
    commentId: number,
    wallet: string,
  ): Promise<'up' | 'down' | null> {
    const client = this.supabaseService.supabase;

    try {
      const { data: vote } = await client
        .from('comment_votes')
        .select('vote_type')
        .eq('comment_id', commentId)
        .eq('user_wallet', wallet.toLowerCase())
        .maybeSingle();

      if (vote) {
        const voteData = vote as unknown as { vote_type: string };
        if (voteData.vote_type === 'up' || voteData.vote_type === 'down') {
          return voteData.vote_type as 'up' | 'down';
        }
      }
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting user vote: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Traccia eventi commenti
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.debug(`Error tracking comment: ${errorMessage}`);
    }
  }
}
