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
-- Table structure for table `national_standard_indicator`
--

DROP TABLE IF EXISTS `national_standard_indicator`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `national_standard_indicator` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `std_code` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国标号',
  `specific_indicator_value` longtext COLLATE utf8mb4_unicode_ci COMMENT '国标指标集合（JSON 数组，存 indexes 完整内容）',
  `manual_review_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '人工审核状态(占位)',
  PRIMARY KEY (`id`),
  KEY `idx_national_standard_indicator_std_code` (`std_code`),
  CONSTRAINT `fk_nsi_std_code` FOREIGN KEY (`std_code`) REFERENCES `national_standard_basic` (`std_code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国标具体指标表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `national_standard_indicator`
--

LOCK TABLES `national_standard_indicator` WRITE;
/*!40000 ALTER TABLE `national_standard_indicator` DISABLE KEYS */;
INSERT INTO `national_standard_indicator` VALUES (5,'GB 10133-2014','[{\"index_name\": \"污染物限量\", \"index_type\": \"引用值\", \"index_content\": {\"水产品中污染物限量\": \"应符合 GB 2762 的规定\"}}, {\"index_name\": \"致病菌限量\", \"index_type\": \"引用值\", \"index_content\": {\"致病菌限量要求\": \"应符合 GB 29921 的规定\"}}, {\"index_name\": \"微生物限量\", \"index_type\": \"具体值\", \"index_content\": {\"大肠菌群/(CFU/g或CFU/mL)\": {\"采样方案及限量\": \"n=5, c=2, m=10^1, M=10^2\", \"检测方法\": \"GB 4789.3 平板计数法\"}, \"菌落总数/(CFU/g或CFU/mL)\": {\"采样方案及限量\": \"n=5, c=2, m=10^4, M=10^5\", \"检测方法\": \"GB 4789.2\"}}}, {\"index_name\": \"食品添加剂使用\", \"index_type\": \"引用值\", \"index_content\": {\"食品添加剂使用规定\": \"应符合 GB 2760 的规定\"}}, {\"index_name\": \"原料要求\", \"index_type\": \"引用值\", \"index_content\": {\"鲜、冻动物性水产品\": \"应符合 GB 2733 的规定\", \"其他原料\": \"应符合相应食品安全标准的规定\"}}]','approved'),(8,'GB 1002-2024','[{\"index_name\": \"带电插套离插合面的最小距离\", \"index_type\": \"具体值\", \"index_content\": {\"图2\": \"8.0 mm\", \"图4\": \"10.0 mm\", \"图6\": \"11.5 mm\"}}, {\"index_name\": \"插座插孔对应腔体的可插入插头插销的深度\", \"index_type\": \"具体值\", \"index_content\": {\"图2\": {\"带电插孔深度 H\": \"17.0 mm\", \"接地插孔深度 H\": \"不适用\"}, \"图4\": {\"带电插孔深度 H\": \"19.0 mm\", \"接地插孔深度 H\": \"22.0 mm\"}, \"图6\": {\"带电插孔深度 H\": \"20.5 mm\", \"接地插孔深度 H\": \"23.5 mm\"}}}, {\"index_name\": \"插头插销根部离插头边缘的距离\", \"index_type\": \"具体值\", \"index_content\": {\"最小距离\": \"≥6.5 mm\"}}, {\"index_name\": \"插头插合面的凸起部分\", \"index_type\": \"具体值\", \"index_content\": {\"最大凸起高度\": \"≤0.5 mm\"}}, {\"index_name\": \"插销绝缘护套高度\", \"index_type\": \"具体值\", \"index_content\": {\"图1插头\": \"7.0+0.5⁰ mm\", \"图3和图5插头\": \"9.0+0.5⁰ mm\"}}, {\"index_name\": \"去除绝缘护套后插销本体的厚度 t\", \"index_type\": \"具体值\", \"index_content\": {\"≤10A\": \"≥1.0 mm\", \"16A\": \"≥1.2 mm\", \"32A\": \"≥1.7 mm\"}}, {\"index_name\": \"去除绝缘护套后插销本体的宽度 w\", \"index_type\": \"具体值\", \"index_content\": {\"≤10A\": \"≥5.2 mm\", \"16A\": \"≥6.7 mm\", \"32A\": \"≥9.0 mm\"}}, {\"index_name\": \"接地插套离插合面的距离\", \"index_type\": \"具体值\", \"index_content\": {\"与同插座带电插套距离关系\": \"≤带电插套离插合面的距离\"}}]',NULL),(9,'GB 10035-2017','[]',NULL);
/*!40000 ALTER TABLE `national_standard_indicator` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-24 16:31:00
