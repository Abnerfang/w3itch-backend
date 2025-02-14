import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindConditions, Repository } from 'typeorm';

import { AuthenticationService } from '../../auth/service';
import { Account } from '../../entities/Account.entity';
import { User } from '../../entities/User.entity';
import { UsersService } from '../users/users.service';
import { JwtTokens, LoginPlatforms, LoginResult } from './types';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    private readonly authService: AuthenticationService,
    private readonly usersService: UsersService,
  ) {}

  async find(searchParams: FindConditions<Account>): Promise<Account[]> {
    return await this.accountsRepository.find(searchParams);
  }
  async findOne(searchParams: any, options = {}): Promise<Account> {
    return await this.accountsRepository.findOne(searchParams, options);
  }
  async save(saveParams: Partial<Account>): Promise<Account> {
    return await this.accountsRepository.save(saveParams);
  }
  async delete(accountId: number) {
    return await this.accountsRepository.delete(accountId);
  }

  private async initUser(
    username: string,
    userAccountData: {
      accountId: string;
      platform: string;
    },
  ): Promise<{ user: User; userAccount: Account }> {
    const user = await this.usersService.save({
      username,
    });
    const userAccount = await this.save({
      ...userAccountData,
      userId: user.id,
    });

    return { user, userAccount };
  }

  async getUserAndAccount(userAccountData: {
    accountId: string;
    platform: string;
  }): Promise<{ user: User; userAccount: Account }> {
    const userAccount: Account = await this.findOne(userAccountData);

    const user = userAccount
      ? await this.usersService.findOne(userAccount.userId)
      : null;

    return { user, userAccount };
  }

  async login(
    accountLoginDto: {
      account: string;
    },
    platform: LoginPlatforms,
  ): Promise<LoginResult & { tokens: JwtTokens }> {
    const userAccountData = {
      accountId: accountLoginDto.account,
      platform,
    };

    const { user, userAccount } = await this.getUserAndAccount(userAccountData);
    if (!user || !userAccount) {
      throw new UnauthorizedException(
        'User account does not exist',
        'UserNotFound',
      );
    }

    const tokens: JwtTokens = await this.authService.signLoginJWT(
      user,
      userAccount,
    );
    return {
      user,
      tokens,
      account: userAccount,
    };
  }

  async signup(
    accountSignupDto: {
      account: string;
      username: string;
    },
    platform: LoginPlatforms,
  ): Promise<LoginResult & { tokens: JwtTokens }> {
    const userAccountData = {
      accountId: accountSignupDto.account,
      platform,
    };

    // if the user has registered before, skip the signup
    let { user, userAccount } = await this.getUserAndAccount(userAccountData);
    if (!user || !userAccount) {
      await this.usersService.validateUsername(accountSignupDto.username);
      const userAndAccount = await this.initUser(
        accountSignupDto.username,
        userAccountData,
      );
      user = userAndAccount.user;
      userAccount = userAndAccount.userAccount;
    }

    const tokens: JwtTokens = await this.authService.signLoginJWT(
      user,
      userAccount,
    );
    return {
      user,
      tokens,
      account: userAccount,
    };
  }
}
