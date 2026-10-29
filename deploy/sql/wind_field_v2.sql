-- ============================================================================
-- 风电施工现场管理 · 数据模型 V2（全新设计，不兼容旧表）
--
-- 结构：项目 → 事项/风机 → 施工记录 → 附件，四层可溯源
-- 旧表（wf_record / wf_record_photo / wf_construction_type 等）在本脚本开头统一 DROP，
-- 属于彻底的架构替换，不提供数据迁移。
--
-- 执行：mysql -h127.0.0.1 -P3306 -uroot -p db_wpm_app < deploy/sql/wind_field_v2.sql
-- 特性：可重复执行（每次重建）；外键保证引用完整性；软删除保留审计价值
-- ============================================================================
use db_wpm_app;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 清理旧结构（含 V1 遗留表与视图）
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS `vw_unit_overview`;
DROP VIEW IF EXISTS `vw_entry_ledger`;
DROP VIEW IF EXISTS `vw_project_summary`;
DROP VIEW IF EXISTS `vw_record_ledger`;

DROP TABLE IF EXISTS `wf_attachment`;
DROP TABLE IF EXISTS `wf_entry`;
DROP TABLE IF EXISTS `wf_unit_step`;
DROP TABLE IF EXISTS `wf_entry_review_log`;
DROP TABLE IF EXISTS `wf_entry_upload_log`;
DROP TABLE IF EXISTS `wf_entry_ledger_snapshot`;
DROP TABLE IF EXISTS `wf_audit_log`;
DROP TABLE IF EXISTS `wf_review_log`;
DROP TABLE IF EXISTS `wf_upload_log`;
DROP TABLE IF EXISTS `wf_ledger_snapshot`;
DROP TABLE IF EXISTS `wf_step`;
DROP TABLE IF EXISTS `wf_unit`;
DROP TABLE IF EXISTS `wf_unit_type`;
DROP TABLE IF EXISTS `wf_entry_type`;
DROP TABLE IF EXISTS `wf_project_member`;
DROP TABLE IF EXISTS `wf_project`;

-- V1 遗留表
DROP TABLE IF EXISTS `wf_record_photo`;
DROP TABLE IF EXISTS `wf_record`;
DROP TABLE IF EXISTS `wf_construction_type`;
DROP TABLE IF EXISTS `wf_device`;
DROP TABLE IF EXISTS `wf_project_legacy`;

-- ============================================================================
-- 一、项目层
-- ============================================================================

CREATE TABLE `wf_project` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `code` varchar(32) NOT NULL COMMENT '项目编号',
  `name` varchar(120) NOT NULL COMMENT '项目名称',
  `scope` char(64) NOT NULL COMMENT '接入通道标识（移动端对接用）',
  `instance` varchar(160) NOT NULL DEFAULT '' COMMENT '服务实例标识',
  `mode` enum('trial','linked') NOT NULL DEFAULT 'trial' COMMENT '通道模式',
  `integration` enum('desktop','manual','trial') NOT NULL DEFAULT 'manual' COMMENT '接入方式',
  `registration_open` tinyint NOT NULL DEFAULT '0' COMMENT '是否开放自助注册',
  `expires_at` datetime(6) DEFAULT NULL COMMENT '通道到期时间',
  `owner_id` int unsigned DEFAULT NULL COMMENT '项目负责人',
  `start_date` date DEFAULT NULL COMMENT '计划开工',
  `end_date` date DEFAULT NULL COMMENT '计划完工',
  `capacity_mw` decimal(10,2) DEFAULT NULL COMMENT '装机容量(MW)',
  `location` varchar(160) NOT NULL DEFAULT '' COMMENT '项目所在地',
  `status` enum('active','paused','done') NOT NULL DEFAULT 'active'
    COMMENT '状态 active在建 paused暂停 done已完工',
  `remark` varchar(500) NOT NULL DEFAULT '' COMMENT '备注',
  `created_by` int unsigned DEFAULT NULL COMMENT '创建人',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_project_scope` (`scope`),
  UNIQUE KEY `IDX_project_code` (`code`),
  KEY `IDX_project_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目';

-- 项目成员：项目级权限，区分谁能审核、谁只能填报
CREATE TABLE `wf_project_member` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `project_id` int NOT NULL COMMENT '项目',
  `user_id` int unsigned NOT NULL COMMENT '成员',
  `role` enum('owner','manager','recorder','viewer') NOT NULL DEFAULT 'recorder'
    COMMENT 'owner负责人 manager管理 recorder记录员 viewer只读',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态 1启用 0移出',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_member_project_user` (`project_id`, `user_id`),
  KEY `IDX_member_user` (`user_id`),
  CONSTRAINT `FK_member_project` FOREIGN KEY (`project_id`) REFERENCES `wf_project` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目成员';

-- ============================================================================
-- 二、事项（风机）层
-- ============================================================================

-- 事项类型字典：回答「这个对象是什么」
CREATE TABLE `wf_unit_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `code` varchar(32) NOT NULL COMMENT '类型编码',
  `name` varchar(60) NOT NULL COMMENT '类型名称',
  `icon` varchar(30) NOT NULL DEFAULT '' COMMENT '图标名',
  `code_label` varchar(20) NOT NULL DEFAULT '编号' COMMENT '编号在界面上的叫法，如风机编号',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态 1启用 0停用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_unit_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='事项类型字典';

-- 施工内容类型字典：回答「干了什么」（吊装/运输/组装…）
CREATE TABLE `wf_entry_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `code` varchar(32) NOT NULL COMMENT '类型编码',
  `name` varchar(60) NOT NULL COMMENT '类型名称',
  `short_name` varchar(30) NOT NULL DEFAULT '' COMMENT '简称',
  `icon` varchar(30) NOT NULL DEFAULT '' COMMENT '图标名',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态 1启用 0停用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_entry_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='施工内容类型字典';

-- 标准工序模板：回答「按规范应该做哪些步骤」
CREATE TABLE `wf_step` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `type_code` varchar(32) NOT NULL COMMENT '事项类型',
  `code` varchar(32) NOT NULL COMMENT '工序编码',
  `name` varchar(60) NOT NULL COMMENT '工序名称',
  `sort` int NOT NULL DEFAULT '0' COMMENT '顺序',
  `required` tinyint NOT NULL DEFAULT '1' COMMENT '1必做 0可选',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态 1启用 0停用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_step_type_code` (`type_code`, `code`),
  CONSTRAINT `FK_step_type` FOREIGN KEY (`type_code`) REFERENCES `wf_unit_type` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='标准工序模板';

-- 事项/风机：用户口中的「T20 风机」就是这一层
CREATE TABLE `wf_unit` (
  `id` varchar(36) NOT NULL COMMENT '事项ID，客户端UUID（支持离线新建）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `project_id` int NOT NULL COMMENT '所属项目',
  `type_code` varchar(32) NOT NULL DEFAULT 'turbine' COMMENT '事项类型',
  `code` varchar(32) NOT NULL COMMENT '事项编号，如 T20 / 1#箱变',
  `name` varchar(120) NOT NULL DEFAULT '' COMMENT '名称补充，如 T20 金风 GW155',
  `location` varchar(160) NOT NULL DEFAULT '' COMMENT '位置描述',
  `longitude` decimal(10,7) DEFAULT NULL COMMENT '经度',
  `latitude` decimal(10,7) DEFAULT NULL COMMENT '纬度',
  `status` enum('planning','building','paused','done','canceled') NOT NULL DEFAULT 'planning'
    COMMENT 'planning待施工 building施工中 paused暂停 done已完成 canceled取消',
  `progress` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '进度0-100，由工序推导后缓存',
  `start_date` date DEFAULT NULL COMMENT '实际开工',
  `end_date` date DEFAULT NULL COMMENT '实际完工',
  `remark` varchar(500) NOT NULL DEFAULT '' COMMENT '备注',
  `created_by` int unsigned DEFAULT NULL COMMENT '创建人',
  `deleted_at` datetime(6) NOT NULL DEFAULT '1970-01-01 00:00:00' COMMENT '软删除时间，未删除为1970',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_unit_project_code` (`project_id`, `code`, `deleted_at`),
  KEY `IDX_unit_project_status` (`project_id`, `status`),
  KEY `IDX_unit_type` (`type_code`),
  CONSTRAINT `FK_unit_project` FOREIGN KEY (`project_id`) REFERENCES `wf_project` (`id`),
  CONSTRAINT `FK_unit_type` FOREIGN KEY (`type_code`) REFERENCES `wf_unit_type` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='事项/风机';

-- 事项工序实例：某台风机每道工序的完成情况
CREATE TABLE `wf_unit_step` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `unit_id` varchar(36) NOT NULL COMMENT '事项',
  `step_code` varchar(32) NOT NULL COMMENT '工序编码',
  `step_name` varchar(60) NOT NULL COMMENT '工序名称快照（模板改名不影响历史）',
  `sort` int NOT NULL DEFAULT '0' COMMENT '顺序快照',
  `status` enum('pending','doing','done','skipped') NOT NULL DEFAULT 'pending'
    COMMENT 'pending待施工 doing进行中 done已完成 skipped已跳过',
  `done_at` datetime(6) DEFAULT NULL COMMENT '完成时间',
  `done_by` int unsigned DEFAULT NULL COMMENT '完成人',
  `remark` varchar(255) NOT NULL DEFAULT '' COMMENT '备注',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_unit_step_unique` (`unit_id`, `step_code`),
  KEY `IDX_unit_step_status` (`unit_id`, `status`),
  KEY `IDX_unit_step_code` (`step_code`),
  CONSTRAINT `FK_unit_step_unit` FOREIGN KEY (`unit_id`) REFERENCES `wf_unit` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='事项工序实例';

-- ============================================================================
-- 三、施工记录层
-- ============================================================================

CREATE TABLE `wf_entry` (
  `id` varchar(36) NOT NULL COMMENT '记录ID，客户端UUID（断点续传幂等）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `code` varchar(40) NOT NULL DEFAULT '' COMMENT '人类可读编号，如 T20-20261029-001',
  `project_id` int NOT NULL COMMENT '所属项目（冗余，便于跨事项统计）',
  `unit_id` varchar(36) NOT NULL COMMENT '所属事项/风机',
  `step_code` varchar(32) DEFAULT NULL COMMENT '关联工序，可空',
  `type_code` varchar(32) NOT NULL DEFAULT 'other' COMMENT '施工内容类型',
  `title` varchar(120) NOT NULL DEFAULT '' COMMENT '事项名称，如 T20 塔筒吊装',
  `content` varchar(2000) NOT NULL DEFAULT '' COMMENT '施工说明/备注',
  `occurred_at` datetime(6) DEFAULT NULL COMMENT '实际发生时间（区别于提交时间）',
  `work_date` date NOT NULL COMMENT '施工日期，按天统计用',
  `location` varchar(120) NOT NULL DEFAULT '' COMMENT '施工地点',
  `longitude` decimal(10,7) DEFAULT NULL COMMENT '经度（现场取证）',
  `latitude` decimal(10,7) DEFAULT NULL COMMENT '纬度（现场取证）',
  `weather` varchar(60) NOT NULL DEFAULT '' COMMENT '天气快照，吊装类关键',
  `temperature` tinyint DEFAULT NULL COMMENT '气温(℃)快照',
  `recorder_id` int unsigned NOT NULL COMMENT '记录人',
  `status` enum('draft','queued','uploading','failed','submitted') NOT NULL DEFAULT 'draft'
    COMMENT '上传状态机',
  `review_status` enum('pending','approved','rejected') DEFAULT 'pending' COMMENT '审核状态',
  `review_remark` varchar(500) NOT NULL DEFAULT '' COMMENT '审核意见',
  `reviewed_by` int unsigned DEFAULT NULL COMMENT '审核人',
  `reviewed_at` datetime(6) DEFAULT NULL COMMENT '审核时间',
  `revision` int NOT NULL DEFAULT '1' COMMENT '本机编辑版本号',
  `attempts` int NOT NULL DEFAULT '0' COMMENT '上传尝试次数',
  `next_retry_at` bigint NOT NULL DEFAULT '0' COMMENT '下次重试时间戳(毫秒)',
  `last_error` varchar(500) NOT NULL DEFAULT '' COMMENT '最近上传失败原因',
  `client_created_at` datetime(6) DEFAULT NULL COMMENT '客户端创建时间',
  `submitted_at` datetime(6) DEFAULT NULL COMMENT '提交时间',
  `deleted_at` datetime(6) NOT NULL DEFAULT '1970-01-01 00:00:00' COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `IDX_entry_unit_time` (`unit_id`, `occurred_at`),
  KEY `IDX_entry_project_status` (`project_id`, `status`),
  KEY `IDX_entry_review` (`review_status`),
  KEY `IDX_entry_recorder` (`recorder_id`),
  KEY `IDX_entry_step` (`unit_id`, `step_code`),
  CONSTRAINT `FK_entry_project` FOREIGN KEY (`project_id`) REFERENCES `wf_project` (`id`),
  CONSTRAINT `FK_entry_unit` FOREIGN KEY (`unit_id`) REFERENCES `wf_unit` (`id`),
  CONSTRAINT `FK_entry_type` FOREIGN KEY (`type_code`) REFERENCES `wf_entry_type` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='施工记录';

-- 附件：照片、文档、语音统一存放
CREATE TABLE `wf_attachment` (
  `id` varchar(36) NOT NULL COMMENT '附件ID，客户端UUID',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `project_id` int NOT NULL COMMENT '所属项目',
  `unit_id` varchar(36) DEFAULT NULL COMMENT '挂事项（如铭牌、合格证）',
  `entry_id` varchar(36) DEFAULT NULL COMMENT '挂施工记录',
  `kind` enum('photo','doc','audio') NOT NULL DEFAULT 'photo' COMMENT '附件类型',
  `name` varchar(160) NOT NULL DEFAULT '' COMMENT '原始文件名',
  `mime` varchar(60) NOT NULL DEFAULT '' COMMENT 'MIME',
  `size` int unsigned NOT NULL DEFAULT '0' COMMENT '字节数',
  `storage_path` varchar(500) NOT NULL COMMENT 'MinIO 对象键',
  `sha256` char(64) NOT NULL DEFAULT '' COMMENT '内容哈希，去重与防篡改',
  `taken_at` datetime(6) DEFAULT NULL COMMENT '拍摄/文件时间',
  `longitude` decimal(10,7) DEFAULT NULL COMMENT '拍摄经度',
  `latitude` decimal(10,7) DEFAULT NULL COMMENT '拍摄纬度',
  `sort` int NOT NULL DEFAULT '0' COMMENT '展示顺序',
  `created_by` int unsigned DEFAULT NULL COMMENT '上传人',
  PRIMARY KEY (`id`),
  KEY `IDX_attach_entry` (`entry_id`, `sort`),
  KEY `IDX_attach_unit` (`unit_id`),
  KEY `IDX_attach_project` (`project_id`),
  KEY `IDX_attach_hash` (`sha256`),
  CONSTRAINT `FK_attach_project` FOREIGN KEY (`project_id`) REFERENCES `wf_project` (`id`),
  CONSTRAINT `FK_attach_unit` FOREIGN KEY (`unit_id`) REFERENCES `wf_unit` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_attach_entry` FOREIGN KEY (`entry_id`) REFERENCES `wf_entry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='附件';

-- ============================================================================
-- 四、留痕与流水
-- ============================================================================

CREATE TABLE `wf_review_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `entry_id` varchar(36) NOT NULL COMMENT '施工记录',
  `action` enum('submit','approve','reject') NOT NULL COMMENT '动作',
  `from_status` varchar(20) NOT NULL DEFAULT '' COMMENT '流转前状态',
  `to_status` varchar(20) NOT NULL DEFAULT '' COMMENT '流转后状态',
  `operator_id` int unsigned DEFAULT NULL COMMENT '操作人',
  `remark` varchar(500) NOT NULL DEFAULT '' COMMENT '说明/退回原因',
  PRIMARY KEY (`id`),
  KEY `IDX_review_entry` (`entry_id`),
  CONSTRAINT `FK_review_entry` FOREIGN KEY (`entry_id`) REFERENCES `wf_entry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审核流水';

CREATE TABLE `wf_upload_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `entry_id` varchar(36) DEFAULT NULL COMMENT '施工记录（附件先传、记录后提交，故可空）',
  `attachment_id` varchar(36) DEFAULT NULL COMMENT '附件',
  `action` enum('photo','doc','entry') NOT NULL COMMENT '动作',
  `result` enum('success','fail') NOT NULL COMMENT '结果',
  `http_status` int DEFAULT NULL COMMENT 'HTTP 状态',
  `message` varchar(500) NOT NULL DEFAULT '' COMMENT '结果说明',
  `client_ip` varchar(64) NOT NULL DEFAULT '' COMMENT '客户端IP',
  PRIMARY KEY (`id`),
  KEY `IDX_upload_entry` (`entry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='上传流水';

-- 操作审计：任何改动可追到人，before/after 留快照
CREATE TABLE `wf_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `project_id` int NOT NULL COMMENT '项目',
  `entity` enum('project','unit','unit_step','entry','attachment') NOT NULL COMMENT '对象类型',
  `entity_id` varchar(36) NOT NULL COMMENT '对象ID',
  `action` varchar(32) NOT NULL COMMENT 'create/update/delete/review/upload/step_done',
  `before` json DEFAULT NULL COMMENT '变更前快照',
  `after` json DEFAULT NULL COMMENT '变更后快照',
  `operator_id` int unsigned DEFAULT NULL COMMENT '操作人',
  `ip` varchar(64) NOT NULL DEFAULT '' COMMENT '来源IP',
  PRIMARY KEY (`id`),
  KEY `IDX_audit_entity` (`entity`, `entity_id`),
  KEY `IDX_audit_project_time` (`project_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='操作审计';

CREATE TABLE `wf_ledger_snapshot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `project_id` int NOT NULL COMMENT '项目',
  `generated_at` datetime(6) NOT NULL COMMENT '生成时间',
  `ledger_status` enum('live','receipts') NOT NULL DEFAULT 'live' COMMENT '口径',
  `total_units` int NOT NULL DEFAULT '0' COMMENT '事项数',
  `total_entries` int NOT NULL DEFAULT '0' COMMENT '记录数',
  `total_attachments` int NOT NULL DEFAULT '0' COMMENT '附件数',
  `payload` json NOT NULL COMMENT '快照明细',
  `created_by` int unsigned DEFAULT NULL COMMENT '生成人',
  PRIMARY KEY (`id`),
  KEY `IDX_snapshot_project` (`project_id`, `generated_at`),
  CONSTRAINT `FK_snapshot_project` FOREIGN KEY (`project_id`) REFERENCES `wf_project` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='台账快照';

-- ============================================================================
-- 五、初始化数据
-- ============================================================================

INSERT INTO `wf_unit_type` (`code`, `name`, `icon`, `code_label`, `sort`) VALUES
  ('turbine',         '风机',       'turbine', '风机编号', 1),
  ('box_transformer', '箱式变压器', 'box',     '箱变编号', 2),
  ('collector',       '集电线路',   'power',   '线路编号', 3),
  ('substation',      '升压站',     'station', '站区编号', 4),
  ('road',            '道路',       'road',    '道路编号', 5),
  ('other',           '其他事项',   'grid',    '事项编号', 9);

INSERT INTO `wf_entry_type` (`code`, `name`, `short_name`, `icon`, `sort`) VALUES
  ('foundation',    '基础施工', '基础',   'foundation', 1),
  ('transport',     '设备运输', '运输',   'truck',      2),
  ('assembly',      '设备组装', '组装',   'tool',       3),
  ('lifting',       '吊装作业', '吊装',   'crane',      4),
  ('electrical',    '电气安装', '电装',   'power',      5),
  ('commissioning', '调试试验', '调试',   'gauge',      6),
  ('other',         '其他',     '其他',   'grid',       9);

-- 风机标准工序（陆上风电常规工序，可按项目调整）
INSERT INTO `wf_step` (`type_code`, `code`, `name`, `sort`, `required`) VALUES
  ('turbine', 'foundation_excavate', '基础开挖',     1, 1),
  ('turbine', 'foundation_rebar',    '基础钢筋绑扎', 2, 1),
  ('turbine', 'foundation_pour',     '基础浇筑',     3, 1),
  ('turbine', 'foundation_cure',     '基础养护',     4, 1),
  ('turbine', 'anchor_install',      '锚栓安装',     5, 1),
  ('turbine', 'tower_hoist',         '塔筒吊装',     6, 1),
  ('turbine', 'nacelle_hoist',       '机舱吊装',     7, 1),
  ('turbine', 'blade_hoist',         '叶片吊装',     8, 1),
  ('turbine', 'cable_wiring',        '电缆敷设接线', 9, 1),
  ('turbine', 'commissioning',       '调试与验收',   10, 1);

INSERT INTO `wf_step` (`type_code`, `code`, `name`, `sort`, `required`) VALUES
  ('box_transformer', 'base_pour',  '基础浇筑',   1, 1),
  ('box_transformer', 'install',    '箱变安装',   2, 1),
  ('box_transformer', 'grounding',  '接地施工',   3, 1),
  ('box_transformer', 'wiring',     '一二次接线', 4, 1),
  ('box_transformer', 'commission', '送电调试',   5, 1);

INSERT INTO `wf_step` (`type_code`, `code`, `name`, `sort`, `required`) VALUES
  ('collector', 'tower_foundation', '杆塔基础', 1, 1),
  ('collector', 'tower_erect',      '杆塔组立', 2, 1),
  ('collector', 'cable_lay',        '导线展放', 3, 1),
  ('collector', 'tension',          '紧线附件', 4, 1),
  ('collector', 'test',             '线路试验', 5, 1);

INSERT INTO `wf_step` (`type_code`, `code`, `name`, `sort`, `required`) VALUES
  ('substation', 'civil',    '土建施工', 1, 1),
  ('substation', 'equip',    '设备安装', 2, 1),
  ('substation', 'wiring',   '接线敷设', 3, 1),
  ('substation', 'test',     '试验调试', 4, 1),
  ('substation', 'energize', '送电投运', 5, 1);

INSERT INTO `wf_step` (`type_code`, `code`, `name`, `sort`, `required`) VALUES
  ('road', 'subgrade',  '路基施工', 1, 1),
  ('road', 'pavement',  '路面施工', 2, 1),
  ('road', 'drainage',  '排水防护', 3, 0);

-- ============================================================================
-- 六、视图
-- ============================================================================

-- 事项总览：一台风机做到哪一步、几条记录、最近记录时间
CREATE VIEW `vw_unit_overview` AS
SELECT
  u.`id`,
  u.`project_id`,
  p.`name`                                                   AS `project_name`,
  u.`type_code`,
  t.`name`                                                   AS `type_name`,
  u.`code`,
  u.`name`,
  u.`location`,
  u.`status`,
  u.`progress`,
  (SELECT COUNT(*) FROM `wf_unit_step` s
    WHERE s.`unit_id` = u.`id` AND s.`status` = 'done')       AS `done_steps`,
  (SELECT COUNT(*) FROM `wf_unit_step` s
    WHERE s.`unit_id` = u.`id` AND s.`status` <> 'skipped')  AS `total_steps`,
  (SELECT COUNT(*) FROM `wf_entry` e
    WHERE e.`unit_id` = u.`id` AND e.`status` = 'submitted'
      AND e.`deleted_at` = '1970-01-01 00:00:00')            AS `entry_count`,
  (SELECT COUNT(*) FROM `wf_attachment` a
    WHERE a.`unit_id` = u.`id`
       OR a.`entry_id` IN (SELECT e2.`id` FROM `wf_entry` e2 WHERE e2.`unit_id` = u.`id`))
                                                             AS `attachment_count`,
  (SELECT MAX(e3.`occurred_at`) FROM `wf_entry` e3
    WHERE e3.`unit_id` = u.`id`)                             AS `last_entry_at`
FROM `wf_unit` u
JOIN `wf_project` p        ON p.`id` = u.`project_id`
LEFT JOIN `wf_unit_type` t ON t.`code` = u.`type_code`
WHERE u.`deleted_at` = '1970-01-01 00:00:00';

-- 记录台账：项目 → 事项 → 记录 → 记录人 → 附件数
CREATE VIEW `vw_entry_ledger` AS
SELECT
  e.`project_id`,
  p.`name`                                   AS `project_name`,
  e.`unit_id`,
  u.`code`                                   AS `unit_code`,
  u.`name`                                   AS `unit_name`,
  e.`id`,
  e.`code`                                   AS `entry_code`,
  e.`step_code`,
  s.`step_name`,
  e.`type_code`,
  t.`name`                                   AS `type_name`,
  e.`title`,
  e.`content`,
  e.`work_date`,
  e.`occurred_at`,
  e.`location`,
  e.`weather`,
  e.`recorder_id`,
  usr.`nickname`                             AS `recorder_name`,
  usr.`username`                             AS `recorder_username`,
  CASE
    WHEN e.`review_status` = 'approved' THEN '已审核'
    WHEN e.`review_status` = 'rejected' THEN '退回修改'
    ELSE '待审核'
  END                                        AS `review_name`,
  e.`review_remark`,
  e.`submitted_at`,
  (SELECT COUNT(*) FROM `wf_attachment` a WHERE a.`entry_id` = e.`id`) AS `attachment_count`
FROM `wf_entry` e
JOIN `wf_project` p        ON p.`id` = e.`project_id`
JOIN `wf_unit` u           ON u.`id` = e.`unit_id`
JOIN `sys_user` usr        ON usr.`id` = e.`recorder_id`
LEFT JOIN `wf_unit_step` s ON s.`unit_id` = e.`unit_id` AND s.`step_code` = e.`step_code`
LEFT JOIN `wf_entry_type` t ON t.`code` = e.`type_code`
WHERE e.`status` = 'submitted' AND e.`deleted_at` = '1970-01-01 00:00:00';

-- 项目汇总：PC 端首页/看板用
CREATE VIEW `vw_project_summary` AS
SELECT
  p.`id`,
  p.`code`,
  p.`name`,
  p.`status`,
  p.`capacity_mw`,
  (SELECT COUNT(*) FROM `wf_unit` u
    WHERE u.`project_id` = p.`id` AND u.`deleted_at` = '1970-01-01 00:00:00') AS `unit_total`,
  (SELECT COUNT(*) FROM `wf_unit` u
    WHERE u.`project_id` = p.`id` AND u.`status` = 'done'
      AND u.`deleted_at` = '1970-01-01 00:00:00')                             AS `unit_done`,
  (SELECT COUNT(*) FROM `wf_entry` e
    WHERE e.`project_id` = p.`id` AND e.`status` = 'submitted'
      AND e.`deleted_at` = '1970-01-01 00:00:00')                             AS `entry_total`,
  (SELECT COUNT(*) FROM `wf_entry` e
    WHERE e.`project_id` = p.`id` AND e.`review_status` = 'pending'
      AND e.`status` = 'submitted'
      AND e.`deleted_at` = '1970-01-01 00:00:00')                             AS `entry_pending`,
  (SELECT COUNT(*) FROM `wf_attachment` a WHERE a.`project_id` = p.`id`)      AS `attachment_total`
FROM `wf_project` p;

SET FOREIGN_KEY_CHECKS = 1;
