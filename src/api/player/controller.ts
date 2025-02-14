import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { PlayerService } from './service';

@ApiTags('Games')
@Controller('player')
export class PlayerController {
  constructor(private readonly service: PlayerService) {}

  @Get('')
  @Get('/')
  async getPlayerIndex(@Req() req: Request, @Res() res: Response) {
    return this.service.getPlayerIndex(req, res);
  }

  @Get('*')
  async getPlayer(@Req() req: Request, @Res() res: Response) {
    return this.service.getPlayer(req, res);
  }
}
