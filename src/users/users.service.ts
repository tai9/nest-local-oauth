import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CommonService } from '../common/common.service';
import { UserEntity } from './entities/user.entity';
import { hash } from 'bcrypt';
import { isNull, isUndefined } from 'src/common/utils/validation.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: EntityRepository<UserEntity>,
    private readonly commonService: CommonService,
  ) {}

  public async create(email: string, name: string, password: string) {
    const formattedEmail = email.toLowerCase();
    await this.checkEmailUniqueness(formattedEmail);
    const formattedName = this.commonService.formatName(name);
    const user = this.usersRepository.create({
      email: formattedEmail,
      name: formattedName,
      username: await this.generateUsername(formattedName),
      password: await hash(password, 10),
    });
    await this.commonService.saveEntity<UserEntity>(
      this.usersRepository,
      user,
      true,
    );
    return user;
  }

  public findOneById(id: number): Promise<UserEntity> {
    const user = this.usersRepository.findOne({ id });
    this.commonService.checkEntityExistence(user, 'User');
    return user;
  }

  public async findOneByEmail(email: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({
      email: email.toLowerCase(),
    });
    this.throwUnauthorizedException(user);
    return user;
  }

  // necessary for password reset
  public async uncheckedUserByEmail(email: string): Promise<UserEntity> {
    return this.usersRepository.findOne({
      email: email.toLowerCase(),
    });
  }

  public async findOneByCredentials(
    id: number,
    version: number,
  ): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ id });
    this.throwUnauthorizedException(user);
    if (user.credentials.version !== version) {
      throw new UnauthorizedException('Invalid crendtials');
    }
    return user;
  }

  public async findOneByUsername(
    username: string,
    forAuth = false,
  ): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({
      username: username.toLowerCase(),
    });
    if (forAuth) {
      this.throwUnauthorizedException(user);
    } else {
      this.commonService.checkEntityExistence(user, 'User');
    }
    return user;
  }

  private throwUnauthorizedException(user: undefined | null | UserEntity) {
    if (isUndefined(user) || isNull(user)) {
      throw new UnauthorizedException('Invalid crendtials');
    }
  }

  private async checkEmailUniqueness(email: string) {
    const count = await this.usersRepository.count({ email });
    if (count > 0) {
      throw new ConflictException('Email already in use');
    }
  }

  /**
   * Generate Username
   *
   * Generates a unique username using a point slug based on the name
   * and if it's already in use, it adds the usernames count to the end
   */
  private async generateUsername(name: string) {
    const pointSlug = this.commonService.generatePointSlug(name);
    const count = await this.usersRepository.count({
      username: {
        $like: `${pointSlug}%`,
      },
    });
    if (count > 0) {
      return `${pointSlug}${count}`;
    }
    return pointSlug;
  }
}
