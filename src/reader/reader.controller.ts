// src/reader/reader.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ReaderService } from './reader.service';
import { VoteData } from './reader.service';

@Controller('reader')
export class ReaderController {
  private readonly logger = new Logger(ReaderController.name);

  constructor(private readonly readerService: ReaderService) {}

  /**
   * Ottieni i dettagli di un manga per la lettura
   */
  @Get('manga/:id')
  async getMangaForReading(@Param('id') id: string) {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    const manga = await this.readerService.getMangaForReading(mangaId);
    if (!manga) {
      throw new HttpException('Manga non trovato', HttpStatus.NOT_FOUND);
    }

    return manga;
  }

  /**
   * Ottieni lo stato dei voti per un manga
   */
  @Get('manga/:id/votes')
  async getVotes(
    @Param('id') id: string,
    @Headers('x-wallet') wallet?: string,
  ) {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    return this.readerService.getVoteStatus(mangaId, wallet);
  }

  /**
   * Vota un manga
   */
  @Post('manga/:id/vote')
  async vote(
    @Param('id') id: string,
    @Body('voteType') voteType: 'up' | 'down',
    @Headers('x-wallet') wallet: string,
  ) {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    if (!['up', 'down'].includes(voteType)) {
      throw new HttpException('Tipo voto non valido', HttpStatus.BAD_REQUEST);
    }

    return this.readerService.vote(mangaId, wallet.toLowerCase(), voteType);
  }

  /**
   * Rimuovi il voto da un manga
   */
  @Delete('manga/:id/vote')
  async removeVote(
    @Param('id') id: string,
    @Headers('x-wallet') wallet: string,
  ) {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    return this.readerService.removeVote(mangaId, wallet.toLowerCase());
  }

  /**
   * Salva il progresso di lettura
   */
  @Post('manga/:id/progress')
  async saveProgress(
    @Param('id') id: string,
    @Body('page') page: number,
    @Body('totalPages') totalPages: number,
    @Headers('x-wallet') wallet: string,
  ) {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    if (page === undefined || totalPages === undefined) {
      throw new HttpException('Dati incompleti', HttpStatus.BAD_REQUEST);
    }

    return this.readerService.saveReadingProgress(
      wallet.toLowerCase(),
      mangaId,
      page,
      totalPages,
    );
  }

  /**
   * Ottieni il progresso di lettura
   */
  @Get('manga/:id/progress')
  async getProgress(
    @Param('id') id: string,
    @Headers('x-wallet') wallet: string,
  ) {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    return this.readerService.getReadingProgress(wallet.toLowerCase(), mangaId);
  }

  /**
   * Ottieni tutti i bookmark dell'utente
   */
  @Get('bookmarks')
  async getBookmarks(@Headers('x-wallet') wallet: string) {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    return this.readerService.getUserBookmarks(wallet.toLowerCase());
  }
}
