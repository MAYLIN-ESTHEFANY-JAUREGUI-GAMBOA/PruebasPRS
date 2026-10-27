package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.out.MaintenanceOrderRepositoryPort;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.mapper.MaintenanceOrderMapper;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.repository.MaintenanceOrderRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Collection;

/**
 * Secondary Outbound Persistence Adapter for MongoDB.
 * Implements MaintenanceOrderRepositoryPort isolating domain from database details.
 */
@Component
@RequiredArgsConstructor
public class MaintenanceOrderPersistenceAdapter implements MaintenanceOrderRepositoryPort {

    private final MaintenanceOrderRepository repository;

    @Override
    public Mono<MaintenanceOrder> findById(String id) {
        return repository.findById(id)
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Mono<MaintenanceOrder> findByOrderCode(String orderCode) {
        return repository.findByOrderCode(orderCode)
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Flux<MaintenanceOrder> findByResourceId(String resourceId) {
        return repository.findByResourceId(resourceId)
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Flux<MaintenanceOrder> findByEntityId(String entityId) {
        return repository.findByEntityId(entityId)
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Flux<MaintenanceOrder> findByOrderStatus(String orderStatus) {
        return repository.findByOrderStatus(orderStatus)
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Flux<MaintenanceOrder> findAll() {
        return repository.findAll()
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Mono<MaintenanceOrder> save(MaintenanceOrder order) {
        return repository.save(MaintenanceOrderMapper.toDocument(order))
                .map(MaintenanceOrderMapper::toDomain);
    }

    @Override
    public Mono<Boolean> existsByResourceIdAndOrderStatusNotIn(String resourceId, Collection<String> statuses) {
        return repository.existsByResourceIdAndOrderStatusNotIn(resourceId, statuses);
    }
}
