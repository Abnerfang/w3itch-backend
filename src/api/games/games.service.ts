import {
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import { Repository } from 'typeorm';

import { Game } from '../../entities/Game.entity';
import { PostedGameEntity } from '../../types';
import { UpdateGameProjectDto } from './dto/update-game-proejct.dto';

@Injectable()
export class GamesService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
  ) {}

  public async paginateGameProjects(options): Promise<Pagination<Game>> {
    this.logger.verbose(
      `Query: ${JSON.stringify(options)}`,
      this.constructor.name,
    );
    const tags = options.tags instanceof Array ? options.tags : [options.tags];
    const queryBuilder = this.gameRepository
      .createQueryBuilder('game')
      .leftJoin('game.tags', 'tag')
      .leftJoinAndSelect('game.tags', 'tagSelect')
      .orderBy(`game.${options.sortBy}`, options.order);

    if (options.username) {
      queryBuilder.andWhere('game.username=:username', {
        username: options.username,
      });
    }
    if (options.tags) {
      tags.forEach((tag) => {
        queryBuilder.andWhere('tag.name = :tag', { tag });
      });
    }

    return paginate<Game>(queryBuilder, {
      page: options.page,
      limit: options.limit,
      route: '/game-projects',
    });
  }

  public async getGameProjectById(id: number): Promise<Game> {
    const game = await this.gameRepository.findOne(id);
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game;
  }

  public async save(game: PostedGameEntity): Promise<Game> {
    return await this.gameRepository.save(game);
  }

  public async validate(game: UpdateGameProjectDto): Promise<void> {
    const exists = await this.gameRepository.findOne({
      where: { gameName: game.gameName },
    });
    if (exists) {
      throw new ConflictException('Game name already exists');
    }
  }
}
