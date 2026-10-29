-- 风电施工现场管理：PC 端「项目管理」菜单
-- 说明：
--   1. 项目由管理员在 PC 端创建，并在此页分配成员；APP 端只显示被加入的项目。
--   2. 权限码 mobile:project 与 nest-admin 中 definePermission('mobile', { PROJECT: 'project' }) 对应，
--      /api/mobile/projects/all、/api/mobile/admin/users 等接口都校验该权限。
--   3. 脚本可重复执行：菜单按 path 判重，角色授权用 INSERT IGNORE。

use db_wpm_app;

-- 一级菜单：风电施工
INSERT INTO sys_menu (parent_id, path, name, permission, type, icon, order_no, component, keep_alive, `show`, status, is_ext, ext_open_mode)
SELECT NULL, 'wind', '风电施工', NULL, 0, 'ant-design:thunderbolt-outlined', 200, NULL, 0, 1, 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM sys_menu) t WHERE t.path = 'wind' AND t.parent_id IS NULL);

SET @wind_id = (SELECT id FROM sys_menu WHERE path = 'wind' AND parent_id IS NULL LIMIT 1);

-- 二级菜单：项目管理
INSERT INTO sys_menu (parent_id, path, name, permission, type, icon, order_no, component, keep_alive, `show`, status, is_ext, ext_open_mode)
SELECT @wind_id, 'projects', '项目管理', 'mobile:project', 1, NULL, 201, 'wind/projects/index', 0, 1, 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM sys_menu) t WHERE t.path = 'projects' AND t.parent_id = @wind_id);

SET @projects_id = (SELECT id FROM sys_menu WHERE path = 'projects' AND parent_id = @wind_id LIMIT 1);

-- 授权给管理员角色（admin），并在权限表中出现后刷新在线用户权限
INSERT IGNORE INTO sys_role_menus (role_id, menu_id)
SELECT 1, @wind_id FROM DUAL
WHERE EXISTS (SELECT 1 FROM sys_role WHERE id = 1);

INSERT IGNORE INTO sys_role_menus (role_id, menu_id)
SELECT 1, @projects_id FROM DUAL
WHERE EXISTS (SELECT 1 FROM sys_role WHERE id = 1);
