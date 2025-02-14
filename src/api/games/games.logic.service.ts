import {
  BadRequestException,
  Inject,
  Injectable,
  LoggerService,
} from '@nestjs/common';
import fs from 'fs';
import { readFile } from 'fs/promises';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Paginated } from 'nestjs-paginate';
import path, { join } from 'path';

import { Game } from '../../entities/Game.entity';
import { Tag } from '../../entities/Tag.entity';
import { UserJWTPayload } from '../../types';
import { PricesService } from '../prices/prices.service';
import { TagsService } from '../tags/tags.service';
import { CreateGameProjectDto } from './dto/create-game-proejct.dto';
import { CreateGameProjectWithFileDto } from './dto/create-game-proejct-with-file.dto';
import { UpdateGameProjectDto } from './dto/update-game-proejct.dto';
import { UpdateGameProjectWithFileDto } from './dto/update-game-proejct-with-file.dto';
import { ValidateGameProjectDto } from './dto/validate-game-proejct.dto';
import { EasyRpgGamesService } from './easy-rpg.games.service';
import { GamesBaseService } from './games.base.service';

@Injectable()
export class GamesLogicService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly gamesBaseService: GamesBaseService,
    private readonly tagsService: TagsService,
    private readonly easyRpgGamesService: EasyRpgGamesService,
    private readonly pricesService: PricesService,
  ) {}

  public checkFileMimeTypeAcceptable(file: Express.Multer.File): void {
    if (
      ![
        'application/zip',
        'application/zip-compressed',
        'application/x-zip-compressed',
      ].includes(file.mimetype.toLowerCase())
    ) {
      throw new BadRequestException(`Invalid mimetype: ${file.mimetype}`);
    }
  }

  private async convertTagsAndPricesFromDtoToEntities(
    game: CreateGameProjectDto | UpdateGameProjectDto,
  ): Promise<Partial<Game>> {
    const tags: Tag[] = await this.tagsService.getOrCreateByNames(game.tags);

    this.logger.verbose(
      `Tags of game are ${JSON.stringify(tags)}`,
      this.constructor.name,
    );

    const prices = game.prices
      ? await Promise.all(
          game.prices.map(async (dto) => {
            return await this.pricesService.save(dto);
          }),
        )
      : undefined;

    return {
      ...game,
      tags,
      prices,
    };
  }

  public saveUploadedFile(file: Express.Multer.File, gameName: string): void {
    const downloadPath = path.join('thirdparty', 'downloads', gameName);
    fs.mkdirSync(downloadPath, { recursive: true });
    fs.createWriteStream(path.join(downloadPath, file.originalname)).write(
      file.buffer,
    );
    this.logger.log(
      `File ${file.originalname} was saved to ${downloadPath}`,
      this.constructor.name,
    );
  }

  public async paginateGameProjects(query, options): Promise<Paginated<Game>> {
    return await this.gamesBaseService.paginateGameProjects(query, options);
  }

  public async findOne(id: number): Promise<Game> {
    return await this.gamesBaseService.findOne(id);
  }

  public async createGameProject(
    user: UserJWTPayload,
    file: Express.Multer.File,
    body: CreateGameProjectWithFileDto,
  ): Promise<Game> {
    const { game } = body;
    await this.gamesBaseService.validateGameName(game);

    this.logger.verbose(
      `File: ${file.originalname}, Game: ${JSON.stringify(game)}`,
      this.constructor.name,
    );
    this.checkFileMimeTypeAcceptable(file);

    await this.easyRpgGamesService.uploadGame(
      game.gameName,
      game.kind,
      file,
      game.charset,
    );

    if (!game.donationAddress) {
      // default donation address is user's login wallet
      game.donationAddress = user.account.accountId;
    }

    const gameEntityPartial = await this.convertTagsAndPricesFromDtoToEntities(
      game,
    );
    const gameProject = await this.gamesBaseService.save({
      ...gameEntityPartial,
      username: user.username,
      file: file.originalname,
    });
    this.saveUploadedFile(file, game.gameName);
    return gameProject;
  }

  public async updateGameProject(
    id: number,
    user: UserJWTPayload,
    file: Express.Multer.File,
    body: UpdateGameProjectWithFileDto,
  ): Promise<Game> {
    await this.gamesBaseService.verifyOwner(id, user);

    const { game } = body;
    const target = await this.gamesBaseService.findOne(id);

    if (file || game?.charset) {
      this.logger.verbose(
        `Update File: ${
          file?.originalname ?? target.file
        }, Game: ${JSON.stringify(game)}`,
        this.constructor.name,
      );
      if (file) {
        this.checkFileMimeTypeAcceptable(file);
      } else {
        const fileBuffer = await readFile(
          join('thirdparty', 'downloads', target.gameName, target.file),
        );
        file = {
          buffer: fileBuffer,
        } as Express.Multer.File;
      }

      await this.easyRpgGamesService.uploadGame(
        target.gameName,
        game?.kind ?? target.kind,
        file,
        game?.charset,
      );
    } else {
      this.logger.verbose(
        `Update game entity: ${JSON.stringify(game)} with no file update`,
        this.constructor.name,
      );
    }

    const gameEntityPartial = await this.convertTagsAndPricesFromDtoToEntities(
      game,
    );

    if (file) {
      gameEntityPartial.file = file.originalname;
    }
    return await this.gamesBaseService.update(id, gameEntityPartial);
  }

  public async delete(id: number, user: UserJWTPayload): Promise<void> {
    await this.gamesBaseService.verifyOwner(id, user);

    const target = await this.gamesBaseService.findOne(id);
    this.easyRpgGamesService.deleteGameDirectory(target.gameName);
    await this.gamesBaseService.delete(id);
  }

  public async deleteGameProjectFiles(id: number, user: UserJWTPayload) {
    await this.gamesBaseService.verifyOwner(id, user);

    const target = await this.gamesBaseService.findOne(id);
    await this.gamesBaseService.update(id, { file: null });
    this.easyRpgGamesService.deleteGameDirectory(target.gameName);
  }

  public async validateGameName(game: ValidateGameProjectDto): Promise<void> {
    await this.gamesBaseService.validateGameName(game);
  }
}
