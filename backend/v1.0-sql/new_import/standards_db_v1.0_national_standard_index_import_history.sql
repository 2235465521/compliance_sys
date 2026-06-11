-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: standards_db_v1.0
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `national_standard_index_import_history`
--

DROP TABLE IF EXISTS `national_standard_index_import_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `national_standard_index_import_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `std_code` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国标号',
  `original_filename` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '上传文件名',
  `import_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed' COMMENT '入库状态：completed / failed',
  `indexes_count` int NOT NULL DEFAULT '0' COMMENT 'indexes 数组条目数',
  `manual_review_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '人工审核状态：pending / approved / rejected',
  `error_message` text COLLATE utf8mb4_unicode_ci COMMENT '失败时的错误信息',
  `created_at` datetime(6) NOT NULL COMMENT '入库时间',
  `updated_at` datetime(6) NOT NULL COMMENT '最后更新时间（如审核状态变更）',
  PRIMARY KEY (`id`),
  KEY `idx_nsiih_std_code` (`std_code`),
  KEY `idx_nsiih_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国标指标入库历史记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `national_standard_index_import_history`
--

LOCK TABLES `national_standard_index_import_history` WRITE;
/*!40000 ALTER TABLE `national_standard_index_import_history` DISABLE KEYS */;
INSERT INTO `national_standard_index_import_history` VALUES (1,'GB 1002-2024','GB 1002-2024_F_家用和类似用途单相插头插座 型式、基本参数和尺寸.pdf','completed',8,'approved',NULL,'2026-05-22 09:41:17.084485','2026-05-22 09:41:27.446765'),(2,'GB 10133-2014','GB 10133-2014_F_水产调味品.pdf','completed',5,'approved',NULL,'2026-05-23 13:28:57.884275','2026-05-23 13:29:46.946841'),(3,'未知标准号(大模型未提供)','6 食品添加剂 阿力甜.pdf','failed',0,NULL,'国标号 \'未知标准号(大模型未提供)\' 在 national_standard_basic 中不存在，指标未入库。','2026-05-23 13:31:02.046752','2026-05-23 13:31:02.046752'),(4,'GB 1002-2024','GB 1002-2024_F_家用和类似用途单相插头插座 型式、基本参数和尺寸.pdf','completed',8,'pending',NULL,'2026-05-23 13:32:02.072156','2026-05-23 13:32:02.072156'),(5,'未知标准号(大模型未提供)','GB 1003-2008 家用和类似用途三相插头插座 型式、基本参数和尺寸.pdf','failed',0,NULL,'国标号 \'未知标准号(大模型未提供)\' 在 national_standard_basic 中不存在，指标未入库。','2026-05-23 13:32:03.447089','2026-05-23 13:32:03.447089'),(6,'GB 10035-2017','GB 10035-2017_F_气囊式体外反搏装置.pdf','completed',0,'pending',NULL,'2026-05-23 13:32:06.801885','2026-05-23 13:32:06.801885'),(7,'未知标准号(大模型未提供)','GB 10055-2007_F_施工升降机安全规程.pdf','failed',0,NULL,'国标号 \'未知标准号(大模型未提供)\' 在 national_standard_basic 中不存在，指标未入库。','2026-05-23 13:32:09.971262','2026-05-23 13:32:09.971262'),(8,'未知标准号(大模型未提供)','GB 10070-1988_F_城市区域环境振动标准.pdf','failed',0,NULL,'国标号 \'未知标准号(大模型未提供)\' 在 national_standard_basic 中不存在，指标未入库。','2026-05-23 13:32:11.856763','2026-05-23 13:32:11.856763'),(9,'未知标准号(大模型未提供)','6 食品添加剂 阿力甜.pdf','failed',0,NULL,'国标号 \'未知标准号(大模型未提供)\' 在 national_standard_basic 中不存在，指标未入库。','2026-05-23 13:40:26.507600','2026-05-23 13:40:26.507600'),(10,'GB 1002-2024','GB 1002-2024_F_家用和类似用途单相插头插座 型式、基本参数和尺寸.pdf','completed',8,'pending',NULL,'2026-05-23 13:40:44.273885','2026-05-23 13:40:44.273885'),(11,'未知标准号(大模型未提供)','GB 1003-2008 家用和类似用途三相插头插座 型式、基本参数和尺寸.pdf','failed',0,NULL,'国标号 \'未知标准号(大模型未提供)\' 在 national_standard_basic 中不存在，指标未入库。','2026-05-23 13:40:45.777207','2026-05-23 13:40:45.777207'),(12,'GB 10035-2017','GB 10035-2017_F_气囊式体外反搏装置.pdf','completed',0,'pending',NULL,'2026-05-23 13:40:48.864845','2026-05-23 13:40:48.864845');
/*!40000 ALTER TABLE `national_standard_index_import_history` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-24 16:31:01
