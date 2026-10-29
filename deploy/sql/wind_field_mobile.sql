-- ============================================================================
-- 风电施工现场管理（移动端）数据库表结构
-- 依据：mobile/src/modules/work/{domain,sync,ledger,api}.ts 的真实数据模型
-- 适配：nest-admin（MySQL 8.x，utf8mb4，TypeORM datetime(6) 约定）
-- 说明：账号体系沿用 nest-admin 的 sys_user，本文件不包含用户表；
--       所有人员字段通过 owner_id / operator_id 外键关联 sys_user(id)。
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. 项目通道表 wf_project
-- 对应移动端 Connection 模型：scope(64位十六进制)是记录归属的项目通道，
-- instance 是服务实例标识，mode 区分独立试用/已链接大屏。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_project`;
CREATE TABLE `wf_project` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `scope`             CHAR(64)     NOT NULL                COMMENT '项目通道标识(64位十六进制)，移动端记录以此归属',
  `name`              VARCHAR(120) NOT NULL                COMMENT '项目名称，如：风电施工现场管理',
  `instance`          VARCHAR(160) NOT NULL DEFAULT ''     COMMENT '服务实例标识，如 nest-admin@192.168.1.10:7001',
  `mode`              ENUM('trial','linked') NOT NULL DEFAULT 'trial' COMMENT '通道模式：trial=独立试用 linked=已连接大屏',
  `integration`       ENUM('desktop','manual','trial') NOT NULL DEFAULT 'manual' COMMENT '接入方式：desktop=电脑端同步 manual=手工填报 trial=试用',
  `registration_open` TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '是否开放自助注册 0否 1是',
  `expires_at`        DATETIME(6)  NULL                    COMMENT '通道/链接到期时间',
  `status`            TINYINT      NOT NULL DEFAULT 1      COMMENT '状态 1启用 0停用',
  `remark`            VARCHAR(255) NOT NULL DEFAULT ''     COMMENT '备注',
  `created_at`        DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at`        DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scope` (`scope`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目通道（移动端 scope/instance 的服务端实体）';

-- ----------------------------------------------------------------------------
-- 2. 施工类型字典 wf_construction_type
-- 对应 domain.ts 的 constructionTypes 固定七类；做成字典便于项目级扩展。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_construction_type`;
CREATE TABLE `wf_construction_type` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `code`       VARCHAR(32)  NOT NULL                COMMENT '类型编码，与移动端 workType 一致',
  `name`       VARCHAR(60)  NOT NULL                COMMENT '类型名称',
  `short_name` VARCHAR(30)  NOT NULL DEFAULT ''     COMMENT '简称，列表/图表使用',
  `icon`       VARCHAR(30)  NOT NULL DEFAULT ''     COMMENT '图标名，对应移动端 static/icons',
  `sort`       INT          NOT NULL DEFAULT 0      COMMENT '排序，越小越靠前',
  `status`     TINYINT      NOT NULL DEFAULT 1      COMMENT '状态 1启用 0停用',
  `created_at` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='施工类型字典';

INSERT INTO `wf_construction_type` (`code`, `name`, `short_name`, `icon`, `sort`) VALUES
  ('foundation',  '风机基础施工', '风机基础', 'foundation', 1),
  ('road',        '道路施工',     '道路施工', 'road',       2),
  ('lifting',     '风机吊装',     '风机吊装', 'turbine',    3),
  ('collector',   '集电线路施工', '集电线路', 'power',      4),
  ('substation',  '升压站施工',   '升压站',   'station',    5),
  ('transport',   '风机运输',     '风机运输', 'truck',      6),
  ('other',       '其他',         '其他',     'grid',       7);

-- ----------------------------------------------------------------------------
-- 3. 施工记录表 wf_record
-- 对应 WorkRecord：本机 uuid 作为主键，实现断点续传的幂等提交；
-- status 为上传状态机（draft→queued→uploading→submitted/failed），
-- review_status 为后台审核三态（已审核/待审核/退回修改）。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_record`;
CREATE TABLE `wf_record` (
  `id`            CHAR(36)     NOT NULL                COMMENT '记录ID，客户端生成UUID，服务端幂等接收',
  `project_scope` CHAR(64)     NOT NULL                COMMENT '所属项目通道 scope',
  `owner_id`      INT UNSIGNED NOT NULL                COMMENT '填报人，关联 sys_user.id',
  `type_code`     VARCHAR(32)  NOT NULL                COMMENT '施工类型，关联 wf_construction_type.code',
  `work_date`     DATE         NOT NULL                COMMENT '施工日期（本地日期，统计按此归档）',
  `location`      VARCHAR(120) NOT NULL                COMMENT '施工地点，最多120字',
  `content`       VARCHAR(2000) NOT NULL               COMMENT '施工说明，最多2000字',
  `status`        ENUM('draft','queued','uploading','failed','submitted') NOT NULL DEFAULT 'draft' COMMENT '上传状态：draft草稿 queued待上传 uploading上传中 failed需重试 submitted已提交',
  `review_status` ENUM('pending','approved','rejected') NULL DEFAULT 'pending' COMMENT '审核状态：pending待审核 approved已审核 rejected退回修改',
  `review_remark` VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '审核意见（退回原因等）',
  `reviewed_by`   INT UNSIGNED NULL                    COMMENT '审核人，关联 sys_user.id',
  `reviewed_at`   DATETIME(6)  NULL                    COMMENT '审核时间',
  `revision`      INT          NOT NULL DEFAULT 1      COMMENT '本机编辑版本号，冲突检测用',
  `attempts`      INT          NOT NULL DEFAULT 0      COMMENT '上传尝试次数',
  `next_retry_at` BIGINT       NOT NULL DEFAULT 0      COMMENT '下次重试时间戳(毫秒)，0=立即可重试',
  `last_error`    VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '最近一次上传失败原因',
  `client_created_at` DATETIME(6) NULL                  COMMENT '客户端创建时间（离线补录场景）',
  `submitted_at`  DATETIME(6)  NULL                    COMMENT '提交时间（服务端接收时间，工作动态按此排序）',
  `created_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_scope_owner_status` (`project_scope`, `owner_id`, `status`),
  KEY `idx_scope_date` (`project_scope`, `work_date`),
  KEY `idx_scope_review` (`project_scope`, `review_status`),
  KEY `idx_scope_submitted` (`project_scope`, `submitted_at`),
  CONSTRAINT `fk_record_project` FOREIGN KEY (`project_scope`) REFERENCES `wf_project` (`scope`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_record_owner` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_record_type` FOREIGN KEY (`type_code`) REFERENCES `wf_construction_type` (`code`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_record_location` CHECK (CHAR_LENGTH(`location`) BETWEEN 1 AND 120),
  CONSTRAINT `ck_record_content` CHECK (CHAR_LENGTH(`content`) BETWEEN 1 AND 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='施工记录（移动端提交的主业务数据）';

-- ----------------------------------------------------------------------------
-- 4. 施工照片表 wf_record_photo
-- 对应 Photo：移动端按 multipart 上传并携带 X-File-Meta 元数据，
-- 上传成功后 remoteId 即本表 id，实现断点续传幂等。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_record_photo`;
CREATE TABLE `wf_record_photo` (
  `id`            CHAR(36)     NOT NULL                COMMENT '照片ID，客户端生成UUID，服务端幂等接收',
  `record_id`     CHAR(36)     NOT NULL                COMMENT '所属施工记录，关联 wf_record.id',
  `project_scope` CHAR(64)     NOT NULL                COMMENT '所属项目通道 scope（与记录一致，冗余校验用）',
  `name`          VARCHAR(160) NOT NULL DEFAULT ''     COMMENT '原始文件名',
  `mime`          VARCHAR(60)  NOT NULL DEFAULT ''     COMMENT '文件 MIME 类型',
  `size`          INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '文件字节数，单张不超过 20MB',
  `storage_path`  VARCHAR(500) NOT NULL                COMMENT '服务端存储相对路径（静态目录）',
  `meta_module`   VARCHAR(32)  NULL                    COMMENT '拍摄时关联的施工类型（X-File-Meta.module）',
  `meta_date`     DATE         NULL                    COMMENT '拍摄时记录的施工日期（X-File-Meta.date）',
  `meta_location` VARCHAR(120) NULL                    COMMENT '拍摄时记录的施工地点（X-File-Meta.location）',
  `meta_description` VARCHAR(500) NULL                  COMMENT '拍摄时记录的说明（X-File-Meta.description，取说明前500字）',
  `created_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '上传时间',
  `updated_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_record` (`record_id`),
  KEY `idx_scope` (`project_scope`),
  CONSTRAINT `fk_photo_record` FOREIGN KEY (`record_id`) REFERENCES `wf_record` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_photo_project` FOREIGN KEY (`project_scope`) REFERENCES `wf_project` (`scope`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_photo_size` CHECK (`size` > 0 AND `size` <= 20971520)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='施工记录照片（含 X-File-Meta 元数据）';

-- ----------------------------------------------------------------------------
-- 5. 审核流转日志 wf_review_log
-- 记录 待审核→已审核/退回修改 的每次操作，支撑台账审核统计与追溯。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_review_log`;
CREATE TABLE `wf_review_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `record_id`   CHAR(36)     NOT NULL                COMMENT '施工记录，关联 wf_record.id',
  `action`      ENUM('submit','approve','reject') NOT NULL COMMENT '动作：submit提交 approve通过 reject退回',
  `from_status` VARCHAR(20)  NOT NULL DEFAULT ''     COMMENT '流转前审核状态',
  `to_status`   VARCHAR(20)  NOT NULL DEFAULT ''     COMMENT '流转后审核状态',
  `operator_id` INT UNSIGNED NULL                    COMMENT '操作人，关联 sys_user.id（提交时为填报人）',
  `remark`      VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '操作说明/退回原因',
  `created_at`  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_record` (`record_id`),
  KEY `idx_operator` (`operator_id`),
  CONSTRAINT `fk_review_record` FOREIGN KEY (`record_id`) REFERENCES `wf_record` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_review_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='施工记录审核流转日志';

-- ----------------------------------------------------------------------------
-- 6. 上传流水表 wf_upload_log
-- 对应 sync.ts 上传队列的服务端侧审计：照片上传与记录提交逐笔留痕，
-- 便于排查“需重试”记录与统计真实上传量。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_upload_log`;
CREATE TABLE `wf_upload_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `record_id`    CHAR(36)     NOT NULL                COMMENT '施工记录，关联 wf_record.id',
  `photo_id`     CHAR(36)     NULL                    COMMENT '照片（上传照片时填写），关联 wf_record_photo.id',
  `action`       ENUM('photo','submit') NOT NULL     COMMENT '动作：photo上传照片 submit提交记录',
  `result`       ENUM('success','fail') NOT NULL      COMMENT '结果',
  `http_status`  INT          NULL                    COMMENT 'HTTP 状态码（429/5xx 参与重试判定）',
  `message`      VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '结果说明/失败原因',
  `client_ip`    VARCHAR(64)  NOT NULL DEFAULT ''     COMMENT '客户端 IP',
  `created_at`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '时间',
  PRIMARY KEY (`id`),
  KEY `idx_record` (`record_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `fk_upload_record` FOREIGN KEY (`record_id`) REFERENCES `wf_record` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_upload_photo` FOREIGN KEY (`photo_id`) REFERENCES `wf_record_photo` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='移动端上传流水（照片/提交逐笔留痕）';

-- ----------------------------------------------------------------------------
-- 7. 台账快照表 wf_ledger_snapshot
-- 对应 LedgerSnapshot：管理员拉取台账时归档一份，
-- ledgerStatus=live 表示实时数据，receipts 表示按回执重建。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_ledger_snapshot`;
CREATE TABLE `wf_ledger_snapshot` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `project_scope` CHAR(64)     NOT NULL                COMMENT '项目通道 scope',
  `generated_at`  DATETIME(6)  NOT NULL                COMMENT '快照生成时间（回执中的 generatedAt）',
  `ledger_status` ENUM('live','receipts') NOT NULL DEFAULT 'live' COMMENT '口径：live实时 receipts按回执',
  `total_records` INT          NOT NULL DEFAULT 0      COMMENT '快照内记录总数',
  `total_photos`  INT          NOT NULL DEFAULT 0      COMMENT '快照内照片总数',
  `payload`       JSON         NOT NULL                COMMENT '快照明细（记录+照片+人员汇总）',
  `created_by`    INT UNSIGNED NULL                    COMMENT '生成人，关联 sys_user.id',
  `created_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_scope_generated` (`project_scope`, `generated_at`),
  CONSTRAINT `fk_ledger_project` FOREIGN KEY (`project_scope`) REFERENCES `wf_project` (`scope`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ledger_user` FOREIGN KEY (`created_by`) REFERENCES `sys_user` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目工作台账快照（管理员端）';

-- ----------------------------------------------------------------------------
-- 8. 设备登记表 wf_device
-- 对应 LocalState.settings.deviceOwner（device-xxx）：识别上报来源设备，
-- 便于离线补录与账号共用场景下的审计，不参与鉴权。
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `wf_device`;
CREATE TABLE `wf_device` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `device_code`   VARCHAR(64)  NOT NULL                COMMENT '设备标识，移动端本机生成的 device-uuid',
  `owner_id`      INT UNSIGNED NULL                    COMMENT '最近登录账号，关联 sys_user.id',
  `platform`      VARCHAR(30)  NOT NULL DEFAULT ''     COMMENT '平台：h5 / app / mp-weixin',
  `user_agent`    VARCHAR(255) NOT NULL DEFAULT ''     COMMENT '客户端 UA 摘要',
  `endpoint`      VARCHAR(160) NOT NULL DEFAULT ''     COMMENT '最近使用的服务器地址',
  `last_seen_at`  DATETIME(6)  NULL                    COMMENT '最近活跃时间',
  `created_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '首次登记时间',
  `updated_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_code` (`device_code`),
  KEY `idx_owner` (`owner_id`),
  CONSTRAINT `fk_device_user` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='移动端设备登记（审计用）';

-- ----------------------------------------------------------------------------
-- 视图：项目台账明细（管理员端直接查询，口径与移动端 analyzeLedger 一致：
-- 只统计 status='submitted' 的记录，审核状态未知时归入待审核）
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS `vw_record_ledger`;
CREATE VIEW `vw_record_ledger` AS
SELECT
  r.`project_scope`,
  r.`id`,
  r.`owner_id`,
  u.`nickname`   AS `reporter_name`,
  u.`username`   AS `reporter_username`,
  t.`name`       AS `type_name`,
  r.`type_code`,
  r.`work_date`,
  r.`location`,
  r.`content`,
  r.`submitted_at`,
  CASE
    WHEN r.`review_status` = 'approved' THEN '已审核'
    WHEN r.`review_status` = 'rejected' THEN '退回修改'
    ELSE '待审核'
  END            AS `review_name`,
  (SELECT COUNT(*) FROM `wf_record_photo` p WHERE p.`record_id` = r.`id`) AS `photo_count`
FROM `wf_record` r
JOIN `sys_user` u            ON u.`id` = r.`owner_id`
JOIN `wf_construction_type` t ON t.`code` = r.`type_code`
WHERE r.`status` = 'submitted';

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 示例数据（按需启用）：创建一个试用项目通道
-- INSERT INTO `wf_project` (`scope`, `name`, `instance`, `mode`, `integration`, `registration_open`)
-- VALUES ('<64位十六进制通道标识>', '风电施工现场管理', 'nest-admin@127.0.0.1:7001', 'trial', 'manual', 0);
-- ----------------------------------------------------------------------------
