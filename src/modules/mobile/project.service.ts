import { randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { ErrorEnum } from '~/constants/error-code.constant'

import { UserEntity } from '~/modules/user/user.entity'

import { CreateProjectDto, ProjectMemberDto, ProjectQueryDto, UpdateProjectDto } from './dto/project.dto'
import { WfProjectMemberEntity } from './entities/wf-project-member.entity'
import { WfProjectEntity } from './entities/wf-project.entity'
import { WfMemberRole } from './mobile.constant'
import { day, iso, pagerOf } from './mobile.util'

/** 项目层：解析当前接入项目、项目权限、通道信息 */
@Injectable()
export class MobileProjectService {
  constructor(
    @InjectRepository(WfProjectEntity)
    private projectRepository: Repository<WfProjectEntity>,
    @InjectRepository(WfProjectMemberEntity)
    private memberRepository: Repository<WfProjectMemberEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  /**
   * 当前接入项目：显式 scope 优先；
   * 未带 scope 时要求服务端只启用一个项目，避免记录归属歧义。
   */
  async resolve(scope?: string): Promise<WfProjectEntity> {
    if (scope) {
      const project = await this.projectRepository.findOneBy({ scope, status: 'active' })
      if (!project)
        throw new BusinessException(ErrorEnum.MOBILE_PROJECT_NOT_FOUND)
      return project
    }

    const projects = await this.projectRepository.find({
      where: { status: 'active' },
      order: { id: 'ASC' },
    })
    if (!projects.length)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_NOT_FOUND)
    if (projects.length > 1)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_AMBIGUOUS)
    return projects[0]
  }

  async findById(id: number): Promise<WfProjectEntity> {
    const project = await this.projectRepository.findOneBy({ id })
    if (!project)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_NOT_FOUND)
    return project
  }

  /**
   * 我参与的项目：管理员返回全部，其他账号只返回被加入的项目。
   * 不再对「未配置成员」的账号兜底返回全部项目——项目由后台分配，
   * 没被加入的人登录后应当看不到任何项目，而不是看到全部项目。
   */
  async listMine(user: IAuthUser) {
    const isAdmin = Boolean(user.roles?.includes('admin'))
    if (isAdmin) {
      const projects = await this.projectRepository.find({ order: { id: 'ASC' } })
      return projects.map(item => this.toClient(item, 'owner'))
    }

    const members = await this.memberRepository.findBy({ userId: user.uid, status: 1 })
    if (!members.length)
      return []

    const projects = await this.projectRepository.findBy({
      id: In(members.map(item => item.projectId)),
    })
    const roles = new Map(members.map(item => [item.projectId, item.role]))
    return projects.map(item => this.toClient(item, roles.get(item.id) || 'recorder'))
  }

  /** 移动端通道：单项目部署时直接给出当前项目 */
  async channel(scope?: string) {
    const project = await this.resolve(scope)
    return {
      id: project.id,
      code: project.code,
      scope: project.scope,
      name: project.name,
      instance: project.instance,
      mode: project.mode,
      integration: project.integration,
    }
  }

  /** 当前用户在项目中的角色：管理员等价于负责人 */
  async roleOf(projectId: number, user: IAuthUser): Promise<WfMemberRole> {
    if (user.roles?.includes('admin'))
      return 'owner'
    const member = await this.memberRepository.findOneBy({
      projectId,
      userId: user.uid,
      status: 1,
    })
    return member?.role || 'recorder'
  }

  /**
   * 可读：必须是项目成员（管理员除外）。
   * 这里必须严格校验——只靠前端隐藏入口挡不住直接调接口，
   * 否则没被分配到项目的人仍能新增风机、拍照、查台账。
   */
  async assertAccess(projectId: number, user: IAuthUser) {
    await this.findById(projectId)
    if (user.roles?.includes('admin'))
      return 'owner' as WfMemberRole

    const member = await this.memberRepository.findOneBy({
      projectId,
      userId: user.uid,
      status: 1,
    })
    if (!member)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_FORBIDDEN)
    return (member.role || 'recorder') as WfMemberRole
  }

  /** 可审核/可管理：负责人或管理员 */
  async assertManager(projectId: number, user: IAuthUser) {
    const role = await this.roleOf(projectId, user)
    if (role !== 'owner' && role !== 'manager')
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_FORBIDDEN)
    return role
  }

  /** 管理端项目列表：分页 + 关键字，管理员可见全部 */
  async listAll(query: ProjectQueryDto) {
    const { page, pageSize, skip } = pagerOf(query.page, query.pageSize)
    const qb = this.projectRepository.createQueryBuilder('p')
    if (query.status)
      qb.andWhere('p.status = :status', { status: query.status })
    if (query.keyword)
      qb.andWhere('(p.code LIKE :kw OR p.name LIKE :kw)', { kw: `%${query.keyword}%` })

    const [items, total] = await qb
      .orderBy('p.id', 'ASC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount()

    // 成员数一并在列表里给出，PC 端不用为每一行再请求一次成员接口
    const counts = items.length
      ? (await this.memberRepository
          .createQueryBuilder('m')
          .select('m.project_id', 'projectId')
          .addSelect('COUNT(*)', 'total')
          .where('m.status = 1')
          .andWhere('m.project_id IN (:...ids)', { ids: items.map(item => item.id) })
          .groupBy('m.project_id')
          .getRawMany()) as Array<{ projectId: number, total: string }>
      : []
    const memberCount = new Map(counts.map(row => [Number(row.projectId), Number(row.total)]))

    return {
      page,
      pageSize,
      total,
      items: items.map(item => this.toClient(item, 'owner', {
        memberCount: memberCount.get(item.id) || 0,
      })),
    }
  }

  /** 新建项目：scope 为移动端接入通道，由服务端生成，避免现场手填 */
  async create(dto: CreateProjectDto, user: IAuthUser) {
    const duplicated = await this.projectRepository.countBy({ code: dto.code.trim() })
    if (duplicated)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_CODE_DUPLICATED)

    const project = this.projectRepository.create({
      code: dto.code.trim(),
      name: dto.name.trim(),
      scope: randomBytes(16).toString('hex'),
      instance: '',
      mode: 'trial',
      integration: dto.integration || 'manual',
      location: (dto.location || '').trim(),
      capacityMw: dto.capacityMw ?? null,
      startDate: dto.startDate || null,
      endDate: dto.endDate || null,
      remark: (dto.remark || '').trim().slice(0, 500),
      status: 'active',
      createdBy: user.uid,
      ownerId: user.uid,
    })
    const saved = await this.projectRepository.save(project)
    // 创建人默认成为项目负责人，避免刚建完项目却无审核权
    await this.memberRepository.insert({
      projectId: saved.id,
      userId: user.uid,
      role: 'owner',
      status: 1,
    })
    return this.toClient(saved, 'owner')
  }

  async update(id: number, dto: UpdateProjectDto, user: IAuthUser) {
    const project = await this.findById(id)
    await this.assertManager(id, user)

    if (dto.name !== undefined)
      project.name = dto.name.trim()
    if (dto.location !== undefined)
      project.location = dto.location.trim()
    if (dto.capacityMw !== undefined)
      project.capacityMw = dto.capacityMw ?? null
    if (dto.startDate !== undefined)
      project.startDate = dto.startDate || null
    if (dto.endDate !== undefined)
      project.endDate = dto.endDate || null
    if (dto.status !== undefined)
      project.status = dto.status
    if (dto.remark !== undefined)
      project.remark = dto.remark.slice(0, 500)

    const saved = await this.projectRepository.save(project)
    return this.toClient(saved, await this.roleOf(id, user))
  }

  /** 项目成员：连同姓名一起返回，前端不用再查用户表 */
  async listMembers(projectId: number, user: IAuthUser) {
    await this.assertAccess(projectId, user)
    const members = await this.memberRepository.find({
      where: { projectId },
      order: { id: 'ASC' },
    })
    const users = members.length
      ? await this.userRepository.find({ where: { id: In(members.map(item => item.userId)) } })
      : []
    const userMap = new Map(users.map(item => [item.id, item]))
    return members.map((member) => {
      const target = userMap.get(member.userId)
      return {
        id: member.id,
        userId: member.userId,
        username: target?.username || '',
        nickname: target?.nickname || '',
        role: member.role,
        status: member.status,
      }
    })
  }

  /** PC 端选人：启用中的账号 + 是否已在该项目，管理员一次可加多人 */
  async listAssignable(query: { keyword?: string, projectId?: number, limit?: number }) {
    const qb = this.userRepository
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.dept', 'dept')
      .where('u.status = :status', { status: 1 })
    if (query.keyword)
      qb.andWhere('(u.username LIKE :kw OR u.nickname LIKE :kw)', { kw: `%${query.keyword}%` })

    const users = await qb
      .orderBy('u.id', 'ASC')
      .take(Math.min(Number(query.limit) || 200, 500))
      .getMany()

    const members = query.projectId
      ? await this.memberRepository.find({ where: { projectId: Number(query.projectId) } })
      : []
    const joined = new Map(members.map(item => [item.userId, item]))

    return users.map(user => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname || '',
      phone: user.phone || '',
      deptName: user.dept?.name || '',
      joined: joined.get(user.id)?.status === 1,
      role: joined.get(user.id)?.role || '',
    }))
  }

  /** 成员角色设置：同一用户重复设置按更新处理 */
  async upsertMember(projectId: number, dto: ProjectMemberDto, user: IAuthUser) {
    await this.assertManager(projectId, user)
    const target = await this.userRepository.findOneBy({ id: dto.userId })
    if (!target)
      throw new BusinessException(ErrorEnum.USER_NOT_FOUND)

    const exists = await this.memberRepository.findOneBy({ projectId, userId: dto.userId })
    if (exists) {
      exists.role = dto.role
      exists.status = 1
      await this.memberRepository.save(exists)
      return { id: exists.id, userId: exists.userId, role: exists.role, status: exists.status }
    }

    const created = await this.memberRepository.save(
      this.memberRepository.create({ projectId, userId: dto.userId, role: dto.role, status: 1 }),
    )
    return { id: created.id, userId: created.userId, role: created.role, status: created.status }
  }

  async removeMember(projectId: number, userId: number, user: IAuthUser) {
    await this.assertManager(projectId, user)
    const member = await this.memberRepository.findOneBy({ projectId, userId })
    if (!member)
      throw new BusinessException(ErrorEnum.USER_NOT_FOUND)
    if (member.role === 'owner')
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_FORBIDDEN)

    // 移出而非删除：保留历史归属，现场人员流动后可回溯
    member.status = 0
    await this.memberRepository.save(member)
    return { userId, removed: true }
  }

  toClient(
    project: WfProjectEntity,
    role: WfMemberRole,
    extra: { memberCount?: number } = {},
  ) {
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      scope: project.scope,
      instance: project.instance,
      mode: project.mode,
      integration: project.integration,
      status: project.status,
      location: project.location,
      capacityMw: project.capacityMw,
      startDate: day(project.startDate),
      endDate: day(project.endDate),
      ownerId: project.ownerId,
      remark: project.remark,
      role,
      memberCount: extra.memberCount ?? undefined,
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
    }
  }
}
