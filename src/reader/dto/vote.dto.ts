// src/reader/dto/vote.dto.ts
export class VoteDto {
  voteType: 'up' | 'down';
}

export class VoteResponseDto {
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
}
